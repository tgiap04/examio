import SwiftUI

// MARK: - Hex color convenience

extension Color {
    /// Create a Color from a 0xRRGGBB hex literal.
    init(hex: UInt, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}

// MARK: - Canonical design tokens (matches examio-fe globals.css light mode)

extension Color {
    // Backgrounds
    static let examioCanvas            = Color(hex: 0xFAF9F7) // canvas / page background
    static let examioSurfaceSoft       = Color(hex: 0xF2F0EC) // subtle raised surface
    static let examioSurfaceCard       = Color(hex: 0xE8E5E0) // card fill
    static let examioSurfaceCreamStrong = Color(hex: 0xDDD9D0) // strong cream

    // Borders / hairlines
    static let examioHairline          = Color(hex: 0xD8D4CC) // 1px card border
    static let examioHairlineSoft      = Color(hex: 0xE0DCD4) // lighter divider

    // Brand / primary
    static let examioCoral             = Color(hex: 0xC2522D) // primary coral
    static let examioCoralActive       = Color(hex: 0xA54524) // pressed state

    // Accents
    static let examioAccentTeal        = Color(hex: 0x5DB8A6)
    static let examioAccentAmber       = Color(hex: 0xE8A55A)

    // Text
    static let examioInk               = Color(hex: 0x1A1A18) // primary foreground
    static let examioBodyStrong        = Color(hex: 0x2D2D2A) // strong body text
    static let examioMuted             = Color(hex: 0x6B6B63) // secondary/muted text

    // Semantic
    static let examioSuccess           = Color(hex: 0x5DB872)
    static let examioWarning           = Color(hex: 0xD4A017)
    static let examioError             = Color(hex: 0xC64545)

    // MARK: Backward-compat aliases (used by existing views)
    static let examioPrimary           = examioCoral
    static let examioCard              = examioSurfaceCard
    static let examioSurface           = examioSurfaceSoft
    static let examioBorder            = examioHairline
}

// MARK: - Corner radius constant

extension CGFloat {
    static let examioCardRadius: CGFloat = 12
}

// MARK: - Card modifier

extension View {
    /// Applies the standard examio card style:
    /// `examioSurfaceCard` fill + `examioHairline` 1px border, rounded 12 pt.
    func examioCard(cornerRadius: CGFloat = .examioCardRadius) -> some View {
        self
            .background(Color.examioSurfaceCard)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.examioHairline, lineWidth: 1)
            )
    }
}
