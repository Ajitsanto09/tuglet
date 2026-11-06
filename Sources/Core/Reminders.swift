import Foundation

// MARK: - Pull gesture

/// Downward drag (points from where the press started) needed to snooze on release.
public let snoozeThreshold: Double = 24
/// Downward drag needed to complete on release.
public let completeThreshold: Double = 120
/// The rope stretches visually up to here; classification uses the real distance.
public let maxStretch: Double = 180

public enum PullAction: Equatable { case snooze, complete }

/// Only the final release position decides; NaN and upward drags do nothing.
public func classifyPull(_ dy: Double) -> PullAction? {
    if dy >= completeThreshold { return .complete }
    if dy >= snoozeThreshold { return .snooze }
    return nil
}

public func visualStretch(_ dy: Double) -> Double { min(maxStretch, max(0, dy.isNaN ? 0 : dy)) }

// MARK: - Model

public struct Reminder: Codable, Identifiable, Equatable {
    public enum Status: String, Codable { case scheduled, due, snoozed, completed }
    public var id: UUID
    public var title: String
    public var createdAt: Date
    /// When it is (next) due; moves forward when snoozed.
    public var dueAt: Date
    public var status: Status
    public var completedAt: Date?
    /// Pip already swung for this due event (not replayed after relaunch).
    public var presented: Bool
}

public struct Settings: Codable, Equatable {
    public enum Side: String, Codable, CaseIterable { case right, left }
    public static let snoozeChoices = [5, 10, 15, 30]
    public var snoozeMinutes = 5
    public var side = Side.right
    public var pauseAnimation = false
    /// Off = Pip shows "A reminder is due" (safer when sharing your screen).
    public var showTitleOnPip = true
    public init() {}
}

public enum ReminderError: Error, Equatable {
    case emptyTitle, titleTooLong, notInFuture, tooFarAhead, capacity, notFound, notDue, undoUnavailable

    public var message: String {
        switch self {
        case .emptyTitle: return "Type what you want to be reminded about."
        case .titleTooLong: return "Keep it to \(Reminders.titleLimit) characters or fewer."
        case .notInFuture: return "Pick a time in the future."
        case .tooFarAhead: return "Pick a time within the next 10 years."
        case .capacity: return "You have \(Reminders.capacity) open reminders, the most Tuglet keeps. Complete or delete some first."
        case .notFound: return "That reminder no longer exists."
        case .notDue: return "That reminder isn't due right now."
        case .undoUnavailable: return "It's too late to undo that."
        }
    }
}

public struct Reminders: Codable, Equatable {
    public static let schemaVersion = 1
    public static let titleLimit = 120
    public static let capacity = 500
    public static let historyLimit = 100
    public static let undoWindow: TimeInterval = 10

    public var schemaVersion = Reminders.schemaVersion
    public var items: [Reminder] = []
    public var settings = Settings()
    public var lastCompleted: UUID?
    public var lastCompletedAt: Date?

    public init() {}

    // MARK: Queries

    /// Due reminders in display order: due time, then creation time, then ID.
    public var dueQueue: [Reminder] { items.filter { $0.status == .due }.sorted(by: Reminders.order) }
    public var upcoming: [Reminder] { items.filter { $0.status == .scheduled || $0.status == .snoozed }.sorted(by: Reminders.order) }
    public var completed: [Reminder] { items.filter { $0.status == .completed }.sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) } }
    public var nextWake: Date? { upcoming.first?.dueAt }

    static func order(_ a: Reminder, _ b: Reminder) -> Bool {
        if a.dueAt != b.dueAt { return a.dueAt < b.dueAt }
        if a.createdAt != b.createdAt { return a.createdAt < b.createdAt }
        return a.id.uuidString < b.id.uuidString
    }

    public func canUndo(now: Date) -> Reminder? {
        guard let id = lastCompleted, let at = lastCompletedAt, now.timeIntervalSince(at) <= Reminders.undoWindow,
              let r = items.first(where: { $0.id == id }), r.status == .completed else { return nil }
        return r
    }

    // MARK: Transitions

    @discardableResult
    public mutating func add(title raw: String, dueAt: Date, now: Date, id: UUID = UUID()) throws -> Reminder {
        let title = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw ReminderError.emptyTitle }
        guard title.count <= Reminders.titleLimit else { throw ReminderError.titleTooLong }
        guard dueAt > now else { throw ReminderError.notInFuture }
        guard dueAt.timeIntervalSince(now) < 10 * 366 * 86_400 else { throw ReminderError.tooFarAhead }
        guard items.filter({ $0.status != .completed }).count < Reminders.capacity else { throw ReminderError.capacity }
        let r = Reminder(id: id, title: title, createdAt: now, dueAt: dueAt, status: .scheduled, completedAt: nil, presented: false)
        items.append(r)
        return r
    }

    public mutating func delete(_ id: UUID) throws {
        guard items.contains(where: { $0.id == id }) else { throw ReminderError.notFound }
        items.removeAll { $0.id == id }
        if lastCompleted == id { lastCompleted = nil; lastCompletedAt = nil }
    }

    public mutating func snooze(_ id: UUID, now: Date) throws {
        let i = try dueIndex(id)
        items[i].status = .snoozed
        items[i].dueAt = now.addingTimeInterval(TimeInterval(settings.snoozeMinutes * 60)) // from now, not from the old due time
        items[i].presented = false
    }

    public mutating func complete(_ id: UUID, now: Date) throws {
        let i = try dueIndex(id)
        items[i].status = .completed
        items[i].completedAt = now
        lastCompleted = id
        lastCompletedAt = now
        // History keeps the newest `historyLimit` completed reminders (disclosed in PRIVACY.md).
        let keep = Set(completed.prefix(Reminders.historyLimit).map(\.id))
        items.removeAll { $0.status == .completed && !keep.contains($0.id) }
    }

    /// Puts the last completed reminder back to Due within the undo window.
    public mutating func undo(now: Date) throws {
        guard let r = canUndo(now: now), let i = items.firstIndex(where: { $0.id == r.id }) else { throw ReminderError.undoUnavailable }
        items[i].status = .due
        items[i].completedAt = nil
        lastCompleted = nil
        lastCompletedAt = nil
    }

    /// Marks every overdue reminder Due (also catches up after sleep or quitting). Returns newly due IDs.
    @discardableResult
    public mutating func sweep(now: Date) -> [UUID] {
        var newlyDue: [UUID] = []
        for i in items.indices where (items[i].status == .scheduled || items[i].status == .snoozed) && items[i].dueAt <= now {
            items[i].status = .due
            newlyDue.append(items[i].id)
        }
        return newlyDue
    }

    public mutating func markPresented(_ id: UUID) {
        if let i = items.firstIndex(where: { $0.id == id && $0.status == .due }) { items[i].presented = true }
    }

    private func dueIndex(_ id: UUID) throws -> Int {
        guard let i = items.firstIndex(where: { $0.id == id }) else { throw ReminderError.notFound }
        guard items[i].status == .due else { throw ReminderError.notDue }
        return i
    }
}

// MARK: - Saving

public enum StorageError: Error, Equatable {
    case newerVersion, unreadable

    public var message: String {
        switch self {
        case .newerVersion: return "Your reminders were saved by a newer Tuglet. Update Tuglet; nothing was changed."
        case .unreadable: return "Tuglet couldn't read its saved reminders. Nothing was changed; the file is kept so it can be recovered."
        }
    }
}

/// Reminders are one JSON file in ~/Library/Application Support/Tuglet.
public struct ReminderFile {
    public let url: URL
    public init(url: URL) { self.url = url }

    public static var standard: ReminderFile {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Tuglet", isDirectory: true)
        return ReminderFile(url: dir.appendingPathComponent("reminders.json"))
    }

    public func load() throws -> Reminders {
        guard FileManager.default.fileExists(atPath: url.path) else { return Reminders() }
        let data = try Data(contentsOf: url)
        struct Version: Decodable { var schemaVersion: Int }
        guard let v = try? JSONDecoder.tuglet.decode(Version.self, from: data) else { throw StorageError.unreadable }
        guard v.schemaVersion <= Reminders.schemaVersion else { throw StorageError.newerVersion }
        guard let r = try? JSONDecoder.tuglet.decode(Reminders.self, from: data) else { throw StorageError.unreadable }
        return r
    }

    /// Atomic write: a crash mid-save leaves the previous file intact.
    public func save(_ r: Reminders) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder.tuglet.encode(r).write(to: url, options: .atomic)
    }
}

extension JSONEncoder {
    static var tuglet: JSONEncoder {
        let e = JSONEncoder() // default date encoding is lossless (seconds as a number)
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }
}

extension JSONDecoder {
    static var tuglet: JSONDecoder { JSONDecoder() }
}
