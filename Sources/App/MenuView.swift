import SwiftUI

/// The menu bar window: add reminders, act on due ones, see what's coming, and settings.
struct MenuView: View {
    @ObservedObject var model: Model
    @State private var title = ""
    @State private var when = Date().addingTimeInterval(15 * 60)
    @State private var error: String?
    @State private var confirmDelete: UUID?
    @State private var showHelp = false

    private var settings: Settings { model.reminders.settings }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Tuglet").font(.title2.bold())
                    Spacer()
                    Text("Version \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev") · first version, more coming soon")
                        .font(.caption).foregroundColor(.secondary)
                }
                if model.reminders.items.isEmpty {
                    Text("Hi, I'm Pip! ⭐️ Add your first reminder below. I'll hang from the top of your screen and swing when it's due.\n\nI also live in the menu bar as ☆. If you can't see it, your menu bar may be full and the star hidden behind the camera notch. You can always double-click Tuglet in Applications to come back here.")
                        .font(.callout)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.yellow.opacity(0.18)))
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let problem = model.problem { Text(problem).foregroundColor(.red).fixedSize(horizontal: false, vertical: true) }
                if let error { Text(error).foregroundColor(.red).fixedSize(horizontal: false, vertical: true) }
                if let u = model.undoable {
                    HStack { Text("Completed “\(u.title)”.").lineLimit(1); Spacer(); Button("Undo") { report(model.undo()) } }
                }
                dueSection
                addSection
                upcomingSection
                settingsSection
                DisclosureGroup("How to use Tuglet", isExpanded: $showHelp) { help }
                HStack {
                    Spacer()
                    Button("Quit Tuglet") { NSApp.terminate(nil) }
                }
            }
            .padding(16)
        }
        .frame(width: 360, height: 560)
    }

    private func report(_ message: String?) { error = message }

    @ViewBuilder private var dueSection: some View {
        if !model.due.isEmpty {
            section("Due now (\(model.due.count))") {
                ForEach(model.due) { r in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(r.title).bold()
                        Text("Due \(r.dueAt.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundColor(.secondary)
                        HStack {
                            Button("Snooze \(settings.snoozeMinutes) min") { report(model.snooze(r.id)) }
                            Button("Complete") { report(model.complete(r.id)) }
                        }
                    }
                    .padding(8).frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 8).stroke(Color.orange))
                }
            }
        }
    }

    private var addSection: some View {
        section("New reminder") {
            TextField("What should Pip remind you about?", text: $title)
                .textFieldStyle(.roundedBorder)
                .onSubmit(add)
            DatePicker("When", selection: $when, displayedComponents: [.date, .hourAndMinute])
            HStack(spacing: 6) {
                ForEach([5, 15, 30, 60], id: \.self) { m in
                    Button("In \(m) min") { when = Date().addingTimeInterval(Double(m) * 60) }
                }
            }
            .controlSize(.small)
            HStack {
                Button("Add reminder", action: add).keyboardShortcut(.defaultAction)
                Spacer()
                Button("Try a 1-minute demo") {
                    report(model.add(title: "Demo: Pip says hello", at: Date().addingTimeInterval(60)))
                }
            }
        }
    }

    private func add() {
        let message = model.add(title: title, at: when)
        report(message)
        if message == nil { title = ""; when = Date().addingTimeInterval(15 * 60) }
    }

    private var upcomingSection: some View {
        section("Coming up (\(model.reminders.upcoming.count))") {
            if model.reminders.upcoming.isEmpty { Text("Nothing scheduled.").foregroundColor(.secondary) }
            ForEach(model.reminders.upcoming) { r in
                HStack(alignment: .top) {
                    VStack(alignment: .leading) {
                        Text(r.title)
                        Text((r.status == .snoozed ? "Snoozed until " : "") + r.dueAt.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption).foregroundColor(.secondary)
                    }
                    Spacer()
                    if confirmDelete == r.id {
                        Button("Confirm delete") { report(model.delete(r.id)); confirmDelete = nil }.foregroundColor(.red)
                    } else {
                        Button("Delete") { confirmDelete = r.id }.accessibilityLabel("Delete \(r.title)")
                    }
                }
            }
        }
    }

    private var settingsSection: some View {
        section("Settings") {
            Picker("Snooze for", selection: Binding(get: { settings.snoozeMinutes }, set: { v in model.update { $0.snoozeMinutes = v } })) {
                ForEach(Settings.snoozeChoices, id: \.self) { Text("\($0) minutes").tag($0) }
            }
            Picker("Pip hangs on the", selection: Binding(get: { settings.side }, set: { v in model.update { $0.side = v } })) {
                Text("Right").tag(Settings.Side.right)
                Text("Left").tag(Settings.Side.left)
            }
            .pickerStyle(.segmented)
            Toggle("Show the reminder text on Pip (turn off when sharing your screen)",
                   isOn: Binding(get: { settings.showTitleOnPip }, set: { v in model.update { $0.showTitleOnPip = v } }))
            Toggle("Keep Pip still (no swinging)", isOn: Binding(get: { settings.pauseAnimation }, set: { v in model.update { $0.pauseAnimation = v } }))
            Toggle("Open Tuglet when I log in", isOn: Binding(get: { model.opensAtLogin }, set: { model.setOpensAtLogin($0) }))
        }
    }

    private var help: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("1. Add a reminder above. Pip appears at the top of your screen and waits.")
            Text("2. When it's due, Pip swings for a few seconds and shows a number.")
            Text("3. Pull Pip **down a little** and let go to **snooze**.")
            Text("4. Pull Pip **all the way down** (about the height of Pip twice) and let go to **complete**. A label tells you which will happen before you let go.")
            Text("5. Changed your mind? Move back up before letting go.")
            Text("6. Prefer clicking? Use the **Snooze** and **Complete** buttons next to Pip or here.")
            Text("7. Completed by mistake? Click **Undo** within 10 seconds.")
            Text("Reminders stay on this Mac only. Tuglet must be running to remind you; turn on “Open Tuglet when I log in”.")
                .foregroundColor(.secondary)
        }
        .font(.callout)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 4)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            content()
        }
    }
}
