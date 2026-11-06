import AppKit
import Combine
import ServiceManagement

/// The single owner of reminder state. Every change is saved before it is shown as done.
@MainActor
final class Model: ObservableObject {
    @Published private(set) var reminders = Reminders()
    /// Shown in the menu and on Pip when something could not be saved or loaded.
    @Published var problem: String?
    /// Brief confirmation under Pip ("Snoozed for 5 minutes.").
    @Published var status: String?
    @Published var now = Date()

    private let file: ReminderFile
    private var timer: Timer?
    private var readOnly = false
    private var statusClear: Timer?

    init(file: ReminderFile = .standard) {
        self.file = file
        do {
            reminders = try file.load()
        } catch let e as StorageError {
            readOnly = true // never overwrite data we can't read
            problem = e.message
        } catch {
            readOnly = true
            problem = StorageError.unreadable.message
        }
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        NotificationCenter.default.addObserver(forName: .NSSystemClockDidChange, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        tick()
    }

    var due: [Reminder] { reminders.dueQueue }
    var current: Reminder? { reminders.dueQueue.first }
    var hasAnything: Bool { !reminders.dueQueue.isEmpty || !reminders.upcoming.isEmpty }

    /// Catch up on anything overdue, then sleep until the next due time.
    func tick() {
        now = Date()
        var next = reminders
        if !next.sweep(now: now).isEmpty { commit(next) }
        schedule()
    }

    private func schedule() {
        timer?.invalidate()
        guard let wake = reminders.nextWake else { return }
        let t = Timer(fire: max(wake, Date()).addingTimeInterval(0.05), interval: 0, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        t.tolerance = 0.5
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    /// Saves `next`; only on success does it become the visible state.
    @discardableResult
    private func commit(_ next: Reminders) -> Bool {
        guard !readOnly else { return false }
        do {
            try file.save(next)
            reminders = next
            if problem != nil { problem = nil }
            schedule()
            return true
        } catch {
            problem = "Tuglet couldn't save that change, so nothing changed. Try again. (\(error.localizedDescription))"
            return false
        }
    }

    private func apply(_ change: (inout Reminders, Date) throws -> Void) -> String? {
        var next = reminders
        let at = Date()
        next.sweep(now: at)
        do { try change(&next, at) } catch let e as ReminderError { return e.message } catch { return error.localizedDescription }
        return commit(next) ? nil : (problem ?? "Couldn't save.")
    }

    // MARK: Actions (return an error message, or nil on success)

    func add(title: String, at: Date) -> String? { apply { try $0.add(title: title, dueAt: at, now: $1) } }
    func delete(_ id: UUID) -> String? { apply { r, _ in try r.delete(id) } }

    func snooze(_ id: UUID) -> String? {
        let err = apply { try $0.snooze(id, now: $1) }
        if err == nil { flash("Snoozed for \(reminders.settings.snoozeMinutes) minutes.") }
        return err
    }

    func complete(_ id: UUID) -> String? {
        let err = apply { try $0.complete(id, now: $1) }
        if err == nil { flash("Done!", seconds: Reminders.undoWindow) }
        return err
    }

    func undo() -> String? {
        let err = apply { try $0.undo(now: $1) }
        if err == nil { flash("Back again. It's still due.") }
        return err
    }

    func markPresented(_ id: UUID) {
        var next = reminders
        next.markPresented(id)
        commit(next)
    }

    func update(_ change: (inout Settings) -> Void) {
        var next = reminders
        change(&next.settings)
        commit(next)
    }

    var undoable: Reminder? { reminders.canUndo(now: now) }

    private func flash(_ text: String, seconds: TimeInterval = 4) {
        status = text
        now = Date()
        statusClear?.invalidate()
        statusClear = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.status = nil; self?.now = Date() }
        }
    }

    // MARK: Open at login

    var opensAtLogin: Bool { SMAppService.mainApp.status == .enabled }

    func setOpensAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            objectWillChange.send()
        } catch {
            problem = "macOS didn't allow Tuglet to open at login. Add it in System Settings → General → Login Items instead."
        }
    }
}
