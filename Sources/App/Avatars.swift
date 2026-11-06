import SwiftUI

/// Characters that can hang on the rope. Pip is original artwork; the rest use the Mac's own emoji.
struct Avatar: Identifiable {
    let id: String
    let name: String
    let emoji: String? // nil = Pip's drawing

    static let groups: [(title: String, items: [Avatar])] = [
        ("Classic", [Avatar(id: "pip", name: "Pip the star", emoji: nil)]),
        ("Animals", [
            Avatar(id: "cat", name: "Cat", emoji: "🐱"), Avatar(id: "dog", name: "Dog", emoji: "🐶"),
            Avatar(id: "fox", name: "Fox", emoji: "🦊"), Avatar(id: "panda", name: "Panda", emoji: "🐼"),
            Avatar(id: "frog", name: "Frog", emoji: "🐸"), Avatar(id: "monkey", name: "Monkey", emoji: "🐵"),
            Avatar(id: "owl", name: "Owl", emoji: "🦉"), Avatar(id: "penguin", name: "Penguin", emoji: "🐧"),
            Avatar(id: "octopus", name: "Octopus", emoji: "🐙"), Avatar(id: "unicorn", name: "Unicorn", emoji: "🦄"),
            Avatar(id: "bee", name: "Bee", emoji: "🐝"), Avatar(id: "sloth", name: "Sloth", emoji: "🦥"),
        ]),
        ("Computer", [
            Avatar(id: "robot", name: "Robot", emoji: "🤖"), Avatar(id: "invader", name: "Space invader", emoji: "👾"),
            Avatar(id: "laptop", name: "Laptop", emoji: "💻"), Avatar(id: "desktop", name: "Desktop computer", emoji: "🖥️"),
            Avatar(id: "keyboard", name: "Keyboard", emoji: "⌨️"), Avatar(id: "mouse", name: "Computer mouse", emoji: "🖱️"),
            Avatar(id: "floppy", name: "Floppy disk", emoji: "💾"), Avatar(id: "joystick", name: "Joystick", emoji: "🕹️"),
            Avatar(id: "bug", name: "Bug", emoji: "🐛"), Avatar(id: "rocket", name: "Rocket", emoji: "🚀"),
            Avatar(id: "coffee", name: "Coffee", emoji: "☕️"), Avatar(id: "nerd", name: "Nerd face", emoji: "🤓"),
        ]),
    ]

    static func find(_ id: String) -> Avatar {
        groups.lazy.flatMap(\.items).first { $0.id == id } ?? groups[0].items[0]
    }
}

/// The hanging character, in a 64×64 box with a small ring on top for the rope.
struct AvatarView: View {
    let avatar: Avatar

    var body: some View {
        if let emoji = avatar.emoji {
            ZStack(alignment: .top) {
                Circle().stroke(Color(red: 0.48, green: 0.35, blue: 0.18), lineWidth: 2.5)
                    .frame(width: 8, height: 8).offset(y: 3)
                Text(emoji).font(.system(size: 44)).frame(width: 64, height: 54).offset(y: 10)
                    .shadow(color: .black.opacity(0.3), radius: 1.5, y: 1)
            }
            .frame(width: 64, height: 64, alignment: .top)
            .accessibilityHidden(true)
        } else {
            PipArt()
        }
    }
}

/// Grid of characters for the Tuglet window and menu.
struct AvatarPicker: View {
    @ObservedObject var model: Model

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Avatar.groups, id: \.title) { group in
                Text(group.title).font(.caption).foregroundColor(.secondary)
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(44), spacing: 6), count: 6), alignment: .leading, spacing: 6) {
                    ForEach(group.items) { a in
                        let selected = model.reminders.settings.avatar == a.id || (a.id == "pip" && Avatar.find(model.reminders.settings.avatar).id == "pip")
                        Button { model.update { $0.avatar = a.id } } label: {
                            AvatarView(avatar: a).scaleEffect(0.6).frame(width: 40, height: 40)
                        }
                        .buttonStyle(.plain)
                        .frame(width: 44, height: 44)
                        .background(RoundedRectangle(cornerRadius: 8).fill(selected ? Color.accentColor.opacity(0.25) : Color.clear))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? Color.accentColor : Color.secondary.opacity(0.25), lineWidth: selected ? 2 : 1))
                        .help(a.name)
                        .accessibilityLabel(a.name)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
            }
        }
    }
}
