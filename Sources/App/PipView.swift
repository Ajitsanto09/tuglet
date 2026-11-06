import AppKit
import SwiftUI

/// Layout constants shared by the view and the window that hosts it.
enum PipLayout {
    static let rope: CGFloat = 22
    static let pip: CGFloat = 64
    static let panelWidth: CGFloat = 276
    static let panelHeight: CGFloat = 170
    static let margin: CGFloat = 16
    /// Space on each side of the character so a big swing isn't clipped by the window.
    static let swingRoom: CGFloat = 40
    /// Extra rope length used by the "drop" bounce.
    static let bounce: CGFloat = 30
}

/// What the Pip window needs to know to size itself.
@MainActor
final class PipUI: ObservableObject {
    @Published var stretch: CGFloat = 0
    @Published var dragging = false
    @Published var collapsed = false
    @Published var armed: PullAction?
    /// True while an attention animation plays (the window makes room for it).
    @Published var swinging = false
}

struct PipView: View {
    @ObservedObject var model: Model
    @ObservedObject var ui: PipUI
    @State private var angle = 0.0
    @State private var pinned: UUID?
    @State private var drop: CGFloat = 0
    @State private var scale: CGFloat = 1
    @State private var startY: CGFloat = 0
    /// Resets on end *and* on cancel (onEnded isn't called when macOS cancels a drag).
    @GestureState private var pressing = false

    private var settings: Settings { model.reminders.settings }
    private var current: Reminder? { model.current }
    private var alignment: HorizontalAlignment { settings.side == .right ? .trailing : .leading }
    private var reduceMotion: Bool { settings.pauseAnimation || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

    var body: some View {
        VStack(alignment: alignment, spacing: 4) {
            hanging
            if showPanel { panel }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: Alignment(horizontal: alignment, vertical: .top))
        .task(id: current?.id) { await attention() } // restarts for each newly shown reminder
        .onChange(of: current?.id) { _ in if current?.id != pinned { cancelDrag() } }
        .onChange(of: pressing) { if !$0 && ui.dragging { cancelDrag() } }
    }

    private var showPanel: Bool { (current != nil && !ui.collapsed) || model.status != nil || model.problem != nil }

    // MARK: Rope + Pip

    private var hanging: some View {
        VStack(spacing: -3) {
            Rectangle().fill(Color(red: 0.48, green: 0.35, blue: 0.18)).frame(width: 2, height: PipLayout.rope + ui.stretch + drop)
                .shadow(color: .white.opacity(0.6), radius: 0.5)
            AvatarView(avatar: Avatar.find(settings.avatar)).frame(width: PipLayout.pip, height: PipLayout.pip)
                .scaleEffect(scale, anchor: .top)
                // Overlays don't change layout, so Pip never shifts while the label shows.
                .overlay(alignment: .topTrailing) {
                    if !model.due.isEmpty {
                        Text(model.due.count > 9 ? "9+" : "\(model.due.count)")
                            .font(.system(size: 11, weight: .bold)).foregroundColor(.white)
                            .padding(.horizontal, 5).frame(minWidth: 18, minHeight: 18)
                            .background(Capsule().fill(Color(red: 0.76, green: 0.25, blue: 0.05)))
                            .overlay(Capsule().stroke(.white, lineWidth: 2))
                            .offset(x: 2, y: 6)
                    }
                }
                .overlay(alignment: settings.side == .right ? .trailing : .leading) {
                    if let armed = ui.armed, ui.dragging {
                        Text(armed == .complete ? "Let go to complete" : "Let go to snooze \(settings.snoozeMinutes) min")
                            .font(.system(size: 12, weight: .semibold)).foregroundColor(.white)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(RoundedRectangle(cornerRadius: 6).fill(Color.black.opacity(0.8)))
                            .fixedSize()
                            .offset(x: settings.side == .right ? -(PipLayout.pip + 4) : PipLayout.pip + 4)
                    }
                }
            .contentShape(Rectangle())
            .gesture(pull)
            .onTapGesture {
                if current != nil { ui.collapsed.toggle() } else { NSApp.sendAction(#selector(AppDelegate.showMain), to: nil, from: nil) }
            }
        }
        .frame(width: PipLayout.pip)
        .rotationEffect(.degrees(angle), anchor: .top)
        .frame(width: PipLayout.pip + 2 * PipLayout.swingRoom)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(current == nil ? "Tuglet: a reminder is scheduled" : "Tuglet: \(model.due.count) reminder\(model.due.count == 1 ? "" : "s") due")
    }

    /// Downward pull measured from where the press started; the release position decides.
    /// Uses the pointer's screen position, because the window grows when a drag starts
    /// and that skews SwiftUI's own translation.
    private var pull: some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .global)
            .updating($pressing) { _, state, _ in state = true }
            .onChanged { g in
                guard let current else { return }
                if !ui.dragging { pinned = current.id; startY = NSEvent.mouseLocation.y + g.translation.height; ui.dragging = true; angle = 0 }
                let dy = Double(startY - NSEvent.mouseLocation.y) // screen y grows upward
                ui.stretch = CGFloat(visualStretch(dy))
                ui.armed = classifyPull(dy)
            }
            .onEnded { _ in
                let dy = Double(startY - NSEvent.mouseLocation.y)
                defer { cancelDrag() }
                guard ui.dragging, let id = pinned, id == current?.id, let action = classifyPull(dy) else { return }
                _ = action == .complete ? model.complete(id) : model.snooze(id)
            }
    }

    private func cancelDrag() {
        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.6)) { ui.stretch = 0 }
        ui.dragging = false
        ui.armed = nil
        pinned = nil
    }

    /// Grabs attention when a reminder becomes due: a drop-and-bounce, a big swing, then a short
    /// shake every 45 seconds while it stays due. Off with "Keep Pip still" or macOS Reduce motion.
    private func attention() async {
        guard let r = current else { return }
        if !r.presented {
            ui.collapsed = false
            NSAccessibility.post(element: NSApp as Any, notification: .announcementRequested,
                                 userInfo: [.announcement: "Tuglet: a reminder is due", .priority: NSAccessibilityPriorityLevel.medium.rawValue])
            model.markPresented(r.id)
            await wiggle([30, -27, 24, -20, 16, -12, 8, -4, 0], step: 0.2, pop: 1.3, dropBy: PipLayout.bounce)
        }
        while !Task.isCancelled {
            do { try await Task.sleep(nanoseconds: 45_000_000_000) } catch { return }
            guard model.current?.id == r.id else { return }
            await wiggle([22, -20, 16, -12, 7, 0], step: 0.12, pop: 1.15, dropBy: 12)
        }
    }

    private func wiggle(_ angles: [Double], step: Double, pop: CGFloat, dropBy: CGFloat) async {
        guard !reduceMotion, !ui.dragging else { return }
        ui.swinging = true
        try? await Task.sleep(nanoseconds: 50_000_000) // let the window make room first
        defer { ui.swinging = false; angle = 0; scale = 1; drop = 0 }
        drop = dropBy
        withAnimation(.interpolatingSpring(stiffness: 260, damping: 6)) { drop = 0 } // yo-yo bounce
        withAnimation(.spring(response: 0.2, dampingFraction: 0.35)) { scale = pop }
        for (i, a) in angles.enumerated() {
            guard !ui.dragging, !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: step)) { angle = a }
            try? await Task.sleep(nanoseconds: UInt64(step * 1_000_000_000))
            if i == 1 { withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { scale = 1 } }
        }
    }

    // MARK: Panel

    private var panel: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let problem = model.problem {
                Text(problem).font(.callout).foregroundColor(.red).fixedSize(horizontal: false, vertical: true)
            }
            if let r = current, !ui.collapsed {
                Text(settings.showTitleOnPip ? r.title : "A reminder is due").font(.headline).lineLimit(3)
                if model.due.count > 1 { Text("1 of \(model.due.count) due").font(.caption).foregroundColor(.secondary) }
                Text("Pull me down a little to snooze, or all the way to complete.").font(.caption).foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    Button("Snooze \(settings.snoozeMinutes) min") { _ = model.snooze(r.id) }
                        .accessibilityLabel("Snooze this reminder for \(settings.snoozeMinutes) minutes")
                    Button("Complete") { _ = model.complete(r.id) }
                    Button("Hide") { ui.collapsed = true }.accessibilityLabel("Hide controls (doesn't complete it)")
                }
            }
            if let status = model.status {
                HStack {
                    Text(status).font(.callout)
                    Spacer()
                    if model.undoable != nil { Button("Undo") { _ = model.undo() } }
                }
            }
        }
        .padding(12)
        .frame(width: PipLayout.panelWidth, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(.regularMaterial))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.12)))
        .shadow(color: .black.opacity(0.2), radius: 10, y: 4)
    }
}
