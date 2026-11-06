import SwiftUI

/// Pip, drawn in a 64×64 design space. Replace this view to change the character.
struct PipArt: View {
    var body: some View {
        Canvas { ctx, size in
            ctx.scaleBy(x: size.width / 64, y: size.height / 64)
            let star = Path { p in
                let pts: [(CGFloat, CGFloat)] = [(32, 12), (39.3, 26.9), (55.8, 29.3), (43.9, 40.9), (46.7, 57.2),
                                                 (32, 49.5), (17.3, 57.2), (20.1, 40.9), (8.2, 29.3), (24.7, 26.9)]
                p.move(to: CGPoint(x: pts[0].0, y: pts[0].1))
                for pt in pts.dropFirst() { p.addLine(to: CGPoint(x: pt.0, y: pt.1)) }
                p.closeSubpath()
            }
            let ink = Color(red: 0.23, green: 0.16, blue: 0.12)
            ctx.stroke(Path(ellipseIn: CGRect(x: 28, y: 3, width: 8, height: 8)), with: .color(Color(red: 0.48, green: 0.35, blue: 0.18)), lineWidth: 2.5)
            ctx.stroke(star, with: .color(Color(red: 0.79, green: 0.54, blue: 0.04)), style: StrokeStyle(lineWidth: 4, lineJoin: .round))
            ctx.fill(star, with: .color(Color(red: 1, green: 0.79, blue: 0.24)))
            for x in [21.5, 42.5] {
                ctx.fill(Path(ellipseIn: CGRect(x: x - 2.4, y: 37.6, width: 4.8, height: 4.8)), with: .color(Color(red: 1, green: 0.56, blue: 0.48).opacity(0.75)))
            }
            for x in [26.5, 37.5] {
                ctx.fill(Path(ellipseIn: CGRect(x: x - 2.2, y: 32.2, width: 4.4, height: 5.6)), with: .color(ink))
            }
            var smile = Path()
            smile.move(to: CGPoint(x: 28, y: 41.5))
            smile.addQuadCurve(to: CGPoint(x: 36, y: 41.5), control: CGPoint(x: 32, y: 45))
            ctx.stroke(smile, with: .color(ink), style: StrokeStyle(lineWidth: 2, lineCap: .round))
        }
        .shadow(color: .black.opacity(0.35), radius: 1.5, y: 1)
        .accessibilityHidden(true)
    }
}
