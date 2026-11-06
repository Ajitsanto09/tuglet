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

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let dir = CommandLine.arguments.firstIndex(of: "--snapshots").map({ CommandLine.arguments[$0 + 1] }) {
            Snapshots.write(to: URL(fileURLWithPath: dir))
            NSApp.terminate(nil)
            return
        }
        pip = PipWindowController(model: model)
    }
}
