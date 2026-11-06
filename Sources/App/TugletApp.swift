import AppKit
import SwiftUI

@main
struct TugletApp: App {
    @NSApplicationDelegateAdaptor private var delegate: AppDelegate

    var body: some Scene {
        MenuBarExtra {
            MenuView(model: delegate.model)
        } label: {
            MenuBarLabel(model: delegate.model)
        }
        .menuBarExtraStyle(.window)
    }
}

struct MenuBarLabel: View {
    @ObservedObject var model: Model
    var body: some View {
        if model.due.isEmpty {
            Image(systemName: "star")
        } else {
            HStack(spacing: 2) { Image(systemName: "star.fill"); Text("\(model.due.count)") }
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let model = Model()
    private var pip: PipWindowController?
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let dir = CommandLine.arguments.firstIndex(of: "--snapshots").map({ CommandLine.arguments[$0 + 1] }) {
            Snapshots.write(to: URL(fileURLWithPath: dir))
            NSApp.terminate(nil)
            return
        }
        pip = PipWindowController(model: model)
        // New users have no reminders yet, so Pip is hidden and the menu bar star may sit behind the notch.
        if model.reminders.items.isEmpty { showMain() }
    }

    /// Double-clicking Tuglet while it's already running.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMain()
        return false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    /// The same content as the menu bar menu, in an ordinary window that is always reachable.
    @objc func showMain() {
        if window == nil {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 360, height: 560),
                             styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
            w.title = "Tuglet"
            w.isReleasedWhenClosed = false
            w.contentView = NSHostingView(rootView: MenuView(model: model))
            w.center()
            window = w
        }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}
