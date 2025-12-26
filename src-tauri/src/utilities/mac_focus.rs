#[cfg(target_os = "macos")]
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use lazy_static::lazy_static;

#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSApplication, NSApplicationActivationOptions, NSRunningApplication, NSWorkspace,
};
#[cfg(target_os = "macos")]
use objc2_foundation::MainThreadMarker;

#[cfg(target_os = "macos")]
lazy_static! {
    static ref PREV_PID: Mutex<Option<i32>> = Mutex::new(None);
}

/// Save the currently frontmost app's PID so we can restore it later.
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn save_current_frontmost_app() {
    let _mtm = unsafe { MainThreadMarker::new_unchecked() };

    unsafe {
        let workspace = NSWorkspace::sharedWorkspace();

        if let Some(frontmost) = workspace.frontmostApplication() {
            let pid = frontmost.processIdentifier();
            let our_pid = std::process::id() as i32;
            let mut lock = PREV_PID.lock().unwrap_or_else(|e| e.into_inner());
            if pid == our_pid {
                *lock = None;
            } else {
                *lock = Some(pid);
            }
        }
    }
}

/// Show/activate the app and the given Tauri window.
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn show_app(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();

    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let app = NSApplication::sharedApplication(mtm);
    unsafe {
        app.activate();
    }
}

/// Hide this app and attempt to restore the previously-frontmost app.
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn hide_app_and_restore_previous(window: tauri::WebviewWindow) {
    let _ = window.hide();

    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let app = NSApplication::sharedApplication(mtm);
    app.hide(None);

    let prev_pid_opt = {
        let mut lock = PREV_PID.lock().unwrap_or_else(|e| e.into_inner());
        lock.take()
    };

    if let Some(prev_pid) = prev_pid_opt {
        unsafe {
            if let Some(prev_app) =
                NSRunningApplication::runningApplicationWithProcessIdentifier(prev_pid)
            {
                let options = NSApplicationActivationOptions::ActivateAllWindows;
                let _ = prev_app.activateWithOptions(options);
            }
        }
    }
}

// Stub implementations for non-macOS platforms
#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn save_current_frontmost_app() {
    // No-op on non-macOS platforms
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn show_app(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn hide_app_and_restore_previous(window: tauri::WebviewWindow) {
    let _ = window.hide();
}
