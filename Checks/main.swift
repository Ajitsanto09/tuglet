// Self-checks for the reminder logic. Run: scripts/check.sh
import Foundation

var failures = 0
var passes = 0
func check(_ ok: @autoclosure () -> Bool, _ what: String, line: Int = #line) {
    if ok() { passes += 1 } else { failures += 1; print("FAIL (line \(line)): \(what)") }
}
func throwsError(_ e: ReminderError, _ body: () throws -> Void) -> Bool {
    do { try body(); return false } catch { return (error as? ReminderError) == e }
}

let t0 = Date(timeIntervalSince1970: 1_793_980_000)
let minute = 60.0

// Pull thresholds
check(classifyPull(23.9) == nil, "below 24 cancels")
check(classifyPull(24) == .snooze, "24 snoozes")
check(classifyPull(119.9) == .snooze, "119.9 snoozes")
check(classifyPull(120) == .complete, "120 completes")
check(classifyPull(-40) == nil, "upward drag cancels")
check(classifyPull(.nan) == nil, "NaN cancels")
check(visualStretch(-5) == 0 && visualStretch(.nan) == 0 && visualStretch(0) == 0, "no stretch for upward/none")
check(visualStretch(500) < maxStretch && visualStretch(10_000) <= maxStretch, "stretch never exceeds the maximum")
check(visualStretch(60) < visualStretch(120) && visualStretch(120) < 120, "rope resists: grows, but less than the pointer")

// Creation validation
var r = Reminders()
check(throwsError(.emptyTitle) { try r.add(title: "   ", dueAt: t0 + minute, now: t0) }, "empty title")
check(throwsError(.titleTooLong) { try r.add(title: String(repeating: "x", count: 121), dueAt: t0 + minute, now: t0) }, "121 chars")
check(throwsError(.notInFuture) { try r.add(title: "a", dueAt: t0, now: t0) }, "past time")
check((try? r.add(title: String(repeating: "x", count: 120), dueAt: t0 + minute, now: t0)) != nil, "120 chars ok")
r = Reminders()
let a = try! r.add(title: "  Review the checkout mockup  ", dueAt: t0 + 10 * minute, now: t0)
check(a.title == "Review the checkout mockup" && a.status == .scheduled, "trims and schedules")
check(r.nextWake == t0 + 10 * minute, "next wake")

// Lifecycle: scheduled → due → snoozed → due → completed → undo
check(r.sweep(now: t0 + 10 * minute - 1).isEmpty, "not due early")
check(r.sweep(now: t0 + 10 * minute) == [a.id], "becomes due")
check(r.sweep(now: t0 + 11 * minute).isEmpty, "sweep idempotent")
let later = t0 + 30 * minute
try! r.snooze(a.id, now: later)
check(r.items[0].status == .snoozed && r.items[0].dueAt == later + 5 * minute, "snooze from now")
check(throwsError(.notDue) { try r.snooze(a.id, now: later) }, "can't snooze twice")
r.sweep(now: later + 5 * minute)
try! r.complete(a.id, now: later + 6 * minute)
check(r.items[0].status == .completed && r.nextWake == nil && r.dueQueue.isEmpty, "completed")
check(throwsError(.notDue) { try r.complete(a.id, now: later + 6 * minute) }, "can't complete twice")
try! r.undo(now: later + 6 * minute + 9)
check(r.items[0].status == .due, "undo within 10s")
try! r.complete(a.id, now: later + 7 * minute)
check(throwsError(.undoUnavailable) { try r.undo(now: later + 7 * minute + 11) }, "undo expires")

// Delete: an old action cannot resurrect it
try! r.delete(a.id)
check(r.items.isEmpty, "deleted")
check(throwsError(.notFound) { try r.complete(a.id, now: later) }, "no resurrection")

// Settings: snooze length
r = Reminders()
r.settings.snoozeMinutes = 15
let b = try! r.add(title: "b", dueAt: t0 + minute, now: t0)
r.sweep(now: t0 + minute)
try! r.snooze(b.id, now: t0 + 2 * minute)
check(r.items[0].dueAt == t0 + 17 * minute, "15-minute snooze")

// Ordering: due time, creation, ID; catch-up of many after downtime
r = Reminders()
let ids = (0..<3).map { _ in UUID() }.sorted { $0.uuidString < $1.uuidString }
try! r.add(title: "late", dueAt: t0 + 5 * minute, now: t0 + 1, id: ids[0])
try! r.add(title: "tie-b", dueAt: t0 + 5 * minute, now: t0, id: ids[2])
try! r.add(title: "tie-a", dueAt: t0 + 5 * minute, now: t0, id: ids[1])
try! r.add(title: "first", dueAt: t0 + 4 * minute, now: t0)
check(r.sweep(now: t0 + 24 * 3600).count == 4, "catch-up marks all due at once")
check(r.dueQueue.map(\.title) == ["first", "tie-a", "tie-b", "late"], "stable order")

// Presentation is remembered; snooze makes a new due event
r.markPresented(r.dueQueue[0].id)
check(r.dueQueue[0].presented, "presented")
let first = r.dueQueue[0].id
try! r.snooze(first, now: t0 + 25 * 3600)
r.sweep(now: t0 + 26 * 3600)
check(r.items.first { $0.id == first }?.presented == false, "new due event swings again")

// History cap
r = Reminders()
for i in 0..<102 {
    let x = try! r.add(title: "t\(i)", dueAt: t0 + minute, now: t0)
    r.sweep(now: t0 + minute)
    try! r.complete(x.id, now: t0 + minute + Double(i))
}
check(r.items.count == 100 && !r.items.contains { $0.title == "t0" || $0.title == "t1" }, "keeps newest 100 completed")

// Capacity
r = Reminders()
for i in 0..<Reminders.capacity { try! r.add(title: "c\(i)", dueAt: t0 + minute, now: t0) }
check(throwsError(.capacity) { try r.add(title: "one more", dueAt: t0 + minute, now: t0) }, "capacity")

// Saving: round trip, missing file, newer schema and corrupt file are never overwritten
let dir = FileManager.default.temporaryDirectory.appendingPathComponent("tuglet-check-\(UUID())")
let file = ReminderFile(url: dir.appendingPathComponent("reminders.json"))
check((try? file.load()) == Reminders(), "missing file = empty")
var saved = Reminders()
try! saved.add(title: "<b>not html</b> & \"quotes\"", dueAt: t0 + minute, now: t0)
saved.settings.side = .left
try! file.save(saved)
check((try? file.load()) == saved, "round trip")
try! Data(#"{"schemaVersion": 99, "items": []}"#.utf8).write(to: file.url)
check({ do { _ = try file.load(); return false } catch { return (error as? StorageError) == .newerVersion } }(), "newer schema refused")
try! Data("garbage".utf8).write(to: file.url)
check({ do { _ = try file.load(); return false } catch { return (error as? StorageError) == .unreadable } }(), "corrupt refused")
check((try? String(contentsOf: file.url, encoding: .utf8)) == "garbage", "corrupt file left untouched")
// A 0.2.x file (no avatar setting) still loads, with the default character
let old = #"{"schemaVersion":1,"items":[],"settings":{"snoozeMinutes":10,"side":"left","pauseAnimation":false,"showTitleOnPip":true}}"#
try! Data(old.utf8).write(to: file.url)
let upgraded = try? file.load()
check(upgraded?.settings.avatar == "pip" && upgraded?.settings.snoozeMinutes == 10 && upgraded?.settings.side == .left, "0.2.x settings load with default avatar")
try? FileManager.default.removeItem(at: dir)

print("\(passes) checks passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
