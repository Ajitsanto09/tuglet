# Development

Tuglet is a native macOS app written in Swift and SwiftUI. It has no dependencies and no Xcode project: three shell scripts call `swiftc` directly.

## Requirements

- macOS 13 or newer.
- Apple's Swift compiler, either from the **Command Line Tools** (`xcode-select --install`, free, about 1–2 GB) or from Xcode. Check it with `swift --version`.
- No Apple Developer account. The app is signed ad hoc.

### If the build fails with "this SDK is not supported by the compiler" or "redefinition of module 'SwiftBridging'"

Your Command Line Tools install is mixed up: the compiler and the SDK come from different updates. Reinstall them cleanly (this needs your Mac password):

```bash
sudo rm -rf /Library/Developer/CommandLineTools
```

```bash
xcode-select --install
```

Alternatively, install Xcode from the App Store and run `sudo xcode-select -s /Applications/Xcode.app`.

## Commands

| Command | What it does |
| --- | --- |
| `scripts/check.sh` | Compiles the reminder logic with `Checks/main.swift` and runs the self-checks (pull thresholds, lifecycle, ordering, undo, history cap, capacity, saving and refusing unreadable/newer files). |
| `scripts/build.sh` | Builds `build/Tuglet.app` for Apple silicon and Intel and signs it ad hoc. Run it with `open build/Tuglet.app`. |
| `scripts/package.sh` | Zips the app as `release/Tuglet-<version>-mac.zip`, writes `SHA256SUMS`, then unzips that archive and checks the signature, version, architectures, icon and checksum. |
| `build/Tuglet.app/Contents/MacOS/Tuglet --snapshots docs/screenshots` | Renders the README images from the real views with made-up data. |

The version lives in `Resources/Info.plist` (`CFBundleShortVersionString`) and must have a matching `## [x.y.z]` section in CHANGELOG.md.

## Code map

```
Sources/Core/Reminders.swift   Pure logic, no UI: pull thresholds (24 / 120 / 180 pt), reminder
                               transitions, ordering, undo, history cap, and the JSON file it saves to.
Sources/App/Model.swift        Owns state on the main thread. Every change is saved first and only
                               then shown. Sleeps until the next due time; catches up on wake,
                               clock changes and launch. Handles open at login (SMAppService).
Sources/App/PipWindow.swift    Borderless floating panel above all apps and Spaces, sized to Pip
                               so the rest of the screen stays clickable.
Sources/App/PipView.swift      Rope, Pip, due badge, pull gesture, the brief swing, and the card.
Sources/App/PipArt.swift       Pip's drawing. Replace this view to change the character.
Sources/App/MenuView.swift     Menu bar window: due, add, coming up, settings, help.
Sources/App/Snapshots.swift    Renders the README images.
Checks/main.swift              Self-checks for Sources/Core.
Resources/                     Info.plist (menu-bar-only app, macOS 13+) and AppIcon.icns.
```

Data lives in `~/Library/Application Support/Tuglet/reminders.json`. Files Tuglet can't read, or that a newer version wrote, are never overwritten.

## Testing by hand

Use made-up titles. Before a release, run through the manual list in [ACCEPTANCE.md](ACCEPTANCE.md).

To start from scratch, quit Tuglet and move `~/Library/Application Support/Tuglet` somewhere else. Don't delete it unless you mean to.
