import AppKit
import SwiftUI

/// Layout constants shared by the view and the window that hosts it.
enum PipLayout {
    static let rope: CGFloat = 22
    static let pip: CGFloat = 64
    static let panelWidth: CGFloat = 276
    static let panelHeight: CGFloat = 170
    static let margin: CGFloat = 16
}

/// What the Pip window needs to know to size itself.
@MainActor
final class PipUI: ObservableObject {
    @Published var stretch: CGFloat = 0
    @Published var dragging = false
    @Published var collapsed = false
    @Published var armed: PullAction?
}

struct PipView: View {
    @ObservedObject var model: Model
    @ObservedObject var ui: PipUI
    @State private var angle = 0.0
    @State private var pinned: UUID?
    @State private var swungFor: UUID?
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
        .onAppear { swingIfNew() }
        .onChange(of: current?.id) { _ in swingIfNew(); if current?.id != pinned { cancelDrag() } }
        .onChange(of: pressing) { if !$0 && ui.dragging { cancelDrag() } }
    }

    private var showPanel: Bool { (current != nil && !ui.collapsed) || model.status != nil || model.problem != nil }

    // MARK: Rope + Pip

    private var hanging: some View {
        VStack(spacing: -3) {
            Rectangle().fill(Color(red: 0.48, green: 0.35, blue: 0.18)).frame(width: 2, height: PipLayout.rope + ui.stretch)
                .shadow(color: .white.opacity(0.6), radius: 0.5)
            PipArt().frame(width: PipLayout.pip, height: PipLayout.pip)
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
            .onTapGesture { if current != nil { ui.collapsed.toggle() } }
        }
        .frame(width: PipLayout.pip)
        .rotationEffect(.degrees(angle), anchor: .top)
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

    /// A brief swing (under 5 s) the first time a reminder becomes due; never replayed.
    private func swingIfNew() {
        guard let r = current, !r.presented, swungFor != r.id else { return }
        swungFor = r.id
        ui.collapsed = false
        NSAccessibility.post(element: NSApp as Any, notification: .announcementRequested,
                             userInfo: [.announcement: "Tuglet: a reminder is due", .priority: NSAccessibilityPriorityLevel.medium.rawValue])
        model.markPresented(r.id)
        guard !reduceMotion else { return }
        Task { @MainActor in
            for a in [14.0, -11, 8, -5, 3, 0, 10, -7, 4, 0] {
                guard !ui.dragging else { angle = 0; return }
                withAnimation(.easeInOut(duration: 0.42)) { angle = a }
                try? await Task.sleep(nanoseconds: 430_000_000)
            }
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
