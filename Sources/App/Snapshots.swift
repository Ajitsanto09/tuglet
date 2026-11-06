import AppKit
import SwiftUI

/// `Tuglet --snapshots <dir>` renders the real views with synthetic data for the docs.
@MainActor
enum Snapshots {
    static func write(to dir: URL) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let now = Date()
        var data = Reminders()
        func item(_ title: String, _ due: TimeInterval, _ status: Reminder.Status) -> Reminder {
            Reminder(id: UUID(), title: title, createdAt: now, dueAt: now.addingTimeInterval(due), status: status, completedAt: nil, presented: true)
        }
        data.items = [item("Review the checkout mockup", -60, .due), item("Take a screen break", -30, .due),
                      item("Prepare refinement notes", 1800, .scheduled), item("Check the release smoke test", 7200, .scheduled)]
        let file = ReminderFile(url: FileManager.default.temporaryDirectory.appendingPathComponent("tuglet-snap-\(UUID()).json"))
        try? file.save(data)
        let model = Model(file: file)

        // Draw through a real (never shown) window so AppKit-backed buttons and lists render too.
        func render<V: View>(_ view: V, _ name: String, _ size: CGSize, dark: Bool) {
            let host = NSHostingView(rootView: view.frame(width: size.width, height: size.height)
                .background(dark ? Color(white: 0.12) : Color(red: 0.98, green: 0.97, blue: 0.95)))
            host.frame = CGRect(origin: .zero, size: size)
            let window = NSWindow(contentRect: host.frame, styleMask: .borderless, backing: .buffered, defer: false)
            window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
            window.contentView = host
            host.layoutSubtreeIfNeeded()
            guard let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return }
            host.cacheDisplay(in: host.bounds, to: rep)
            try? rep.representation(using: .png, properties: [:])?.write(to: dir.appendingPathComponent("\(name)-\(dark ? "dark" : "light").png"))
        }
        for dark in [false, true] {
            let due = PipUI()
            render(PipView(model: model, ui: due), "due", CGSize(width: 290, height: 300), dark: dark)
            let pulling = PipUI()
            pulling.dragging = true; pulling.stretch = 130; pulling.armed = .complete; pulling.collapsed = true
            render(PipView(model: model, ui: pulling), "pull-complete", CGSize(width: 260, height: 260), dark: dark)
            let snoozing = PipUI()
            snoozing.dragging = true; snoozing.stretch = 60; snoozing.armed = .snooze; snoozing.collapsed = true
            render(PipView(model: model, ui: snoozing), "pull-snooze", CGSize(width: 260, height: 200), dark: dark)
            render(MenuView(model: model), "menu", CGSize(width: 360, height: 560), dark: dark)
            render(AvatarPicker(model: model).padding(16), "characters", CGSize(width: 330, height: 420), dark: dark)
            let lineup = HStack(alignment: .top, spacing: 18) {
                ForEach(["pip", "cat", "fox", "robot", "invader", "laptop", "coffee"], id: \.self) { id in
                    VStack(spacing: -3) {
                        Rectangle().fill(Color(red: 0.48, green: 0.35, blue: 0.18)).frame(width: 2, height: CGFloat(id.count * 6 % 30 + 18))
                        AvatarView(avatar: Avatar.find(id)).frame(width: 64, height: 64)
                    }
                }
            }
            render(lineup, "lineup", CGSize(width: 600, height: 130), dark: dark)
            let flashes = HStack(spacing: 24) {
                ForEach([true, false], id: \.self) { complete in
                    ZStack {
                        AvatarView(avatar: Avatar.find(complete ? "pip" : "cat")).frame(width: 64, height: 64).brightness(0.25)
                        FlashBurst(progress: 0.3, complete: complete).frame(width: 140, height: 140)
                    }
                    .frame(width: 140, height: 140)
                }
            }
            render(flashes, "flash", CGSize(width: 330, height: 150), dark: dark)
        }
        try? FileManager.default.removeItem(at: file.url)
    }
}
