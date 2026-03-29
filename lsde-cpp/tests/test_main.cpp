// Custom GTest main — replaces gtest_main to suppress Windows abort dialogs
// and print actionable crash diagnostics to stderr.

#include <gtest/gtest.h>
#include <cstdio>
#include <cstdlib>
#include <exception>

#ifdef _WIN32
#include <windows.h>
#include <crtdbg.h>
#include <csignal>

static void abort_handler(int) {
    fprintf(stderr, "\n[CRASH] abort() called — likely an uncaught C++ exception.\n");
    fflush(stderr);
    _exit(1);
}

static void on_terminate() {
    fprintf(stderr, "\n[CRASH] std::terminate() called.\n");
    try {
        auto eptr = std::current_exception();
        if (eptr) std::rethrow_exception(eptr);
    } catch (const std::exception& e) {
        fprintf(stderr, "[CRASH] Exception: %s\n", e.what());
    } catch (...) {
        fprintf(stderr, "[CRASH] Unknown non-std exception.\n");
    }
    fflush(stderr);
    _exit(1);
}

static void install_crash_diagnostics() {
    // Route CRT assertions/errors to stderr instead of modal dialogs
    _CrtSetReportMode(_CRT_ASSERT, _CRTDBG_MODE_FILE);
    _CrtSetReportFile(_CRT_ASSERT, _CRTDBG_FILE_STDERR);
    _CrtSetReportMode(_CRT_ERROR, _CRTDBG_MODE_FILE);
    _CrtSetReportFile(_CRT_ERROR, _CRTDBG_FILE_STDERR);
    _CrtSetReportMode(_CRT_WARN, _CRTDBG_MODE_FILE);
    _CrtSetReportFile(_CRT_WARN, _CRTDBG_FILE_STDERR);
    // Suppress the "abort() has been called" dialog
    _set_abort_behavior(0, _WRITE_ABORT_MSG | _CALL_REPORTFAULT);
    // Suppress Windows Error Reporting pop-ups
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
    // Intercept abort and terminate
    signal(SIGABRT, abort_handler);
    std::set_terminate(&on_terminate);
}

// Run before static init of other TUs (test param generators) via init_seg
#pragma warning(disable: 4073)
#pragma init_seg(lib)
static struct CrashDiagInit {
    CrashDiagInit() { install_crash_diagnostics(); }
} _crash_diag_init;
#endif

GTEST_API_ int main(int argc, char** argv) {
#ifdef _WIN32
    install_crash_diagnostics();
#endif
    testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
