// LSDE Dialog Engine — Condition evaluation
//
// The engine never compares anything itself. It does not read a dictionary, does not know what
// `credits` holds, does not implement `greaterOrEqual`. It hands each test to the game's
// `onResolveCondition()` and only assembles the answers — which is why the v2 operator set going
// from a free string to six closed values changed nothing here.
//
// What this file owns is the assembling: how tests chain inside a case, and which port a block
// of cases comes out of.
//
// v2 replaced the 2D `ExportCondition[][]` with a flat list of cases that each carry their own
// port, so there is no index to derive any more — a case says where it exits. It also dropped the
// dispatcher mode entirely (see problem 4): a switch picks ONE path, a dispatcher took them all,
// and having both behind a checkbox on the same block meant a designer read three wires leaving a
// condition as a choice when it was three simultaneous launches. `isAsync` already covers that
// need, on any block, visibly.

import type { ConditionTest, ConditionCase, Option, RuntimeChoiceItem } from './types.js';
import { ConditionJoin, Ports } from './types.js';

/** What the game answers for one comparison. */
export type ConditionEvaluator = ( test: ConditionTest ) => boolean;

/**
 * Evaluate a chain of tests left to right, **with no operator precedence**.
 *
 * `a AND b OR c` reads as `(a AND b) OR c`, never as `a AND (b OR c)`. That is deliberate: the
 * editor draws a flat list, so the engine evaluates a flat list. A writer who needs grouping uses
 * two condition blocks in a row, which is also what the reader of the graph sees.
 *
 * `join` links a test to the one ABOVE it and is absent on the first. Missing means AND.
 *
 * **Every test is evaluated, even once the answer is settled.** No short-circuit: the game's
 * evaluator is also where a project logs, counts or displays what was asked, and skipping calls
 * would make that log depend on the order the writer happened to use.
 *
 * No tests at all = true. That is how "always" is written in v2 — by the ABSENCE of `when`,
 * never by an empty list.
 */
export function evaluateConditionChain(
	tests: ConditionTest[] | undefined,
	evaluator: ConditionEvaluator,
): boolean {
	if ( !tests || tests.length === 0 ) return true;

	let result = evaluator( tests[0]! );

	for ( let i = 1; i < tests.length; i++ ) {
		const test = tests[i]!;
		const current = evaluator( test );

		if ( test.join === ConditionJoin.Or ) {
			result = result || current;
		} else {
			result = result && current;
		}
	}

	return result;
}

/**
 * Pick the exit port of a condition block. There are two modes and only two.
 *
 * | `portPerCase` | rule | exit |
 * |---|---|---|
 * | absent | every case must hold | `out` if they all do, `default` otherwise |
 * | `true` | the first case that holds, in order | its own port (`K1`…), `default` if none |
 *
 * A case with no `when` is always true — and makes every case below it unreachable in
 * `portPerCase` mode. That is the writer's drawing, not an error to report.
 *
 * A block with no cases at all leaves by `out`: nothing was asked, so nothing failed.
 */
export function evaluateConditionCases(
	cases: ConditionCase[] | undefined,
	portPerCase: boolean,
	evaluator: ConditionEvaluator,
): string {
	if ( !cases || cases.length === 0 ) return Ports.Out;

	if ( portPerCase ) {
		for ( const conditionCase of cases ) {
			if ( evaluateConditionChain( conditionCase.when, evaluator ) ) {
				return conditionCase.port;
			}
		}
		return Ports.Default;
	}

	// if mode: the cases share one exit, so they all have to hold to take it.
	for ( const conditionCase of cases ) {
		if ( !evaluateConditionChain( conditionCase.when, evaluator ) ) {
			return Ports.Default;
		}
	}
	return Ports.Out;
}

/**
 * Pick the exit port from case results that were ALREADY computed.
 *
 * Same rules as {@link evaluateConditionCases}, same answer — it just does not ask again.
 *
 * The engine needs both halves for every condition block: a result per case, so the handler is
 * handed answers rather than questions, and the port to leave by. Calling the two functions in a
 * row asked the game's evaluator about the same test twice, and how many times depended on the
 * mode and on which case matched — which broke the one promise this file makes, that a project can
 * count and log what it was asked.
 *
 * {@link evaluateConditionCases} keeps its short-circuit: a game calling it on its own really does
 * stop at the first case that holds. That saves nothing HERE, because filling `result` for every
 * case has already asked about all of them.
 */
export function pickPortFromResults(
	cases: ConditionCase[] | undefined,
	portPerCase: boolean,
	results: boolean[],
): string {
	if ( !cases || cases.length === 0 ) return Ports.Out;

	if ( portPerCase ) {
		for ( let i = 0; i < cases.length; i++ ) {
			if ( results[i] ) return cases[i]!.port;
		}
		return Ports.Default;
	}

	// if mode: the cases share one exit, so they all have to hold to take it.
	for ( let i = 0; i < cases.length; i++ ) {
		if ( !results[i] ) return Ports.Default;
	}
	return Ports.Out;
}

/**
 * A ROUTER's exits: the port of every true case, then `then` or `catch`.
 *
 * The opposite reading of the same `cases` a condition carries. A condition asks *which one* and
 * leaves by a single port; a router asks *which ones*, launches each of them, and continues
 * besides — by `then` when every case held, by `catch` when any did not.
 *
 * Three rules this encodes, all of them from the format's own contract:
 *
 * - **No break.** Every case is counted, so a false one in the middle does not hide the true ones
 *   after it. That is the whole difference with a condition.
 * - **The tally is over CASES, not over ports.** A port carrying several wires launches several
 *   tracks and still counts as one case — and two cases wired to the same block dispatch it twice.
 * - **No cases at all → `then`**, the way `Promise.all([])` resolves.
 *
 * The continuation is LAST in the list on purpose: the traversal keeps the first non-async target
 * as the main flow, so `then`/`catch` stays the main flow as long as the case routes are async.
 *
 * `catch` cancels nothing. The tracks of the true cases are already running by the time the tally
 * is read — exactly like a `Promise.all` that rejects while its promises carry on.
 */
export function pickRouterPorts(
	cases: ConditionCase[] | undefined,
	results: boolean[],
): string[] {
	if ( !cases || cases.length === 0 ) return [Ports.Then];

	const ports: string[] = [];
	let matched = 0;
	for ( let i = 0; i < cases.length; i++ ) {
		if ( !results[i] ) continue;
		ports.push( cases[i]!.port );
		matched++;
	}

	ports.push( matched === cases.length ? Ports.Then : Ports.Catch );
	return ports;
}

/**
 * Evaluate every case on its own, without picking a port.
 *
 * Handed to a game that wants to show what matched without changing where the flow goes. The
 * engine fills `context.cases[i].result` with the same rule, then reads the exit port off those
 * results, by the same rule {@link evaluateConditionCases} applies — never by calling this and
 * deciding for itself.
 */
export function evaluateEachCase(
	cases: ConditionCase[] | undefined,
	evaluator: ConditionEvaluator,
): boolean[] {
	if ( !cases ) return [];
	return cases.map( c => evaluateConditionChain( c.when, evaluator ) );
}

/**
 * Tag every option of a choice with whether its `when` holds.
 *
 * The engine hands over **all** the options, tagged — never a shortened list. A game that wants
 * only the offered ones writes `options.filter( o => o.visible !== false )`; a game that wants to
 * grey out the others, or show "[locked]", still has them. Filtering here would take that away.
 *
 * `visible` is left `undefined` when no evaluator is installed: unknown, not hidden.
 */
export function tagOptionVisibility(
	options: Option[] | undefined,
	evaluator: ConditionEvaluator | undefined,
): RuntimeChoiceItem[] {
	if ( !options ) return [];
	if ( !evaluator ) return options.map( option => ( { ...option } ) );

	return options.map( option => ( {
		...option,
		visible: evaluateConditionChain( option.when, evaluator ),
	} ) );
}

/**
 * Is this test about what the player already answered, rather than about game state?
 *
 * `choice` is a reserved dictionary id — no project dictionary may take it. `entry` is a CHOICE
 * block id of this scene and `value` an option id of that block. The engine answers these from
 * the history it kept during the scene, so they never reach the game's evaluator: a game does not
 * have to remember what it already told the engine.
 */
export function isChoiceTest( test: ConditionTest ): boolean {
	return test.dict === Ports.Choice;
}
