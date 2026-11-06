# Contributing

Thanks for helping. Setup and the code map are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Before opening a pull request

```bash
scripts/check.sh            # reminder-logic self-checks
scripts/build.sh            # builds build/Tuglet.app
open build/Tuglet.app       # try it: add, pull a little, pull fully, buttons, Undo
```

## Ground rules

- **Made-up data only** in checks, screenshots and issues ("Review the checkout mockup"). No real names, URLs or work details.
- **Nothing leaves the Mac.** Any network access, new stored data or macOS permission must be explained in the PR and update docs/PRIVACY.md and CHANGELOG.md.
- **Every pull has a button.** Keep Snooze/Complete buttons, Undo and VoiceOver labels working; respect Reduce motion.
- **Logic stays in `Sources/Core`**, with a self-check in `Checks/main.swift` for anything non-trivial.
- **Never overwrite data Tuglet can't read.**

## Characters

Characters must be original or properly licensed, readable on light and dark backgrounds, and come with an accessible description. Today Pip is `Sources/App/PipArt.swift`. Note the license and attribution in the PR.
