import AppKit
import Combine
import SwiftUI

/// A borderless, click-through-free floating panel that hangs Pip from the top of the screen,
/// above every app and Space. It is sized to Pip's content so the rest of the screen stays clickable.
@MainActor
final class PipWindowController {
    private let panel: NSPanel
    private let model: Model
    private let ui = PipUI()
    private var bag = Set<AnyCancellable>()

    init(model: Model) {
        self.model = model
        panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.contentView = NSHostingView(rootView: PipView(model: model, ui: ui))

        model.objectWillChange.merge(with: ui.objectWillChange)
            .receive(on: RunLoop.main) // after the change has landed
            .sink { [weak self] in self?.layout() }
            .store(in: &bag)
        NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
            .sink { [weak self] _ in self?.layout() }
            .store(in: &bag)
        layout()
    }

    private func layout() {
        let visible = model.hasAnything || model.status != nil || model.problem != nil
        guard visible, let screen = NSScreen.screens.first else { panel.orderOut(nil); return }
        let panelShown = (model.current != nil && !ui.collapsed) || model.status != nil || model.problem != nil
        let width = panelShown || ui.dragging ? PipLayout.panelWidth : PipLayout.pip + 8 // room for the "Let go to…" label
        // While dragging, reserve the full stretch so the window doesn't resize under the pointer.
        let stretch = ui.dragging ? CGFloat(maxStretch) : ui.stretch
        let height = PipLayout.rope + stretch + PipLayout.pip + (panelShown ? PipLayout.panelHeight : 0) + 24
        let area = screen.visibleFrame // just below the menu bar
        let x = model.reminders.settings.side == .right ? area.maxX - width - PipLayout.margin : area.minX + PipLayout.margin
        let frame = NSRect(x: x, y: area.maxY - height, width: width, height: height)
        if panel.frame != frame { panel.setFrame(frame, display: true) }
        if !panel.isVisible { panel.orderFrontRegardless() }
    }
}
