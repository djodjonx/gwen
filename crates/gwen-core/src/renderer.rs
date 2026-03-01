//! Renderer core - 2D rendering with Canvas backend

use crate::transform_math::Mat3;

/// RGBA Color
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    /// Create color from RGBA (0.0-1.0)
    pub const fn new(r: f32, g: f32, b: f32, a: f32) -> Self {
        Color { r, g, b, a }
    }

    /// Create color from RGBA (0-255)
    pub fn from_bytes(r: u8, g: u8, b: u8, a: u8) -> Self {
        Color {
            r: r as f32 / 255.0,
            g: g as f32 / 255.0,
            b: b as f32 / 255.0,
            a: a as f32 / 255.0,
        }
    }

    /// Convert to CSS color string
    pub fn to_css(&self) -> String {
        format!(
            "rgba({},{},{},{})",
            (self.r * 255.0) as u8,
            (self.g * 255.0) as u8,
            (self.b * 255.0) as u8,
            self.a
        )
    }

    // Color constants
    pub const BLACK: Color = Color { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
    pub const WHITE: Color = Color { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    pub const RED: Color = Color { r: 1.0, g: 0.0, b: 0.0, a: 1.0 };
    pub const GREEN: Color = Color { r: 0.0, g: 1.0, b: 0.0, a: 1.0 };
    pub const BLUE: Color = Color { r: 0.0, g: 0.0, b: 1.0, a: 1.0 };
    pub const YELLOW: Color = Color { r: 1.0, g: 1.0, b: 0.0, a: 1.0 };
    pub const CYAN: Color = Color { r: 0.0, g: 1.0, b: 1.0, a: 1.0 };
    pub const MAGENTA: Color = Color { r: 1.0, g: 0.0, b: 1.0, a: 1.0 };
    pub const TRANSPARENT: Color = Color { r: 0.0, g: 0.0, b: 0.0, a: 0.0 };

    /// Blend two colors
    pub fn blend(self, other: Color, t: f32) -> Color {
        Color {
            r: self.r + (other.r - self.r) * t,
            g: self.g + (other.g - self.g) * t,
            b: self.b + (other.b - self.b) * t,
            a: self.a + (other.a - self.a) * t,
        }
    }

    /// Adjust opacity
    pub fn with_alpha(mut self, alpha: f32) -> Color {
        self.a = alpha.max(0.0).min(1.0);
        self
    }
}

/// Sprite component for rendering
#[derive(Debug, Clone)]
pub struct Sprite {
    pub width: f32,
    pub height: f32,
    pub color: Color,
    pub opacity: f32,
}

impl Sprite {
    /// Create new sprite
    pub fn new(width: f32, height: f32) -> Self {
        Sprite {
            width,
            height,
            color: Color::WHITE,
            opacity: 1.0,
        }
    }

    /// Set color
    pub fn with_color(mut self, color: Color) -> Self {
        self.color = color;
        self
    }

    /// Set opacity
    pub fn with_opacity(mut self, opacity: f32) -> Self {
        self.opacity = opacity.max(0.0).min(1.0);
        self
    }
}

/// Render command
#[derive(Debug, Clone)]
pub enum RenderCommand {
    /// Clear screen with color
    Clear(Color),
    /// Draw sprite at transform
    DrawSprite {
        sprite: Sprite,
        transform: Mat3,
    },
    /// Present/swap buffers
    Present,
}

/// Render queue - deferred rendering
pub struct RenderQueue {
    commands: Vec<RenderCommand>,
}

impl RenderQueue {
    /// Create new render queue
    pub fn new() -> Self {
        RenderQueue {
            commands: Vec::new(),
        }
    }

    /// Queue clear command
    pub fn clear(&mut self, color: Color) {
        self.commands.push(RenderCommand::Clear(color));
    }

    /// Queue sprite draw
    pub fn draw_sprite(&mut self, sprite: Sprite, transform: Mat3) {
        self.commands.push(RenderCommand::DrawSprite { sprite, transform });
    }

    /// Queue present
    pub fn present(&mut self) {
        self.commands.push(RenderCommand::Present);
    }

    /// Get queued commands
    pub fn commands(&self) -> &[RenderCommand] {
        &self.commands
    }

    /// Clear queue
    pub fn flush(&mut self) {
        self.commands.clear();
    }

    /// Get command count
    pub fn len(&self) -> usize {
        self.commands.len()
    }

    /// Is queue empty
    pub fn is_empty(&self) -> bool {
        self.commands.is_empty()
    }
}

impl Default for RenderQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_color_creation() {
        let c = Color::new(0.5, 0.5, 0.5, 1.0);
        assert_eq!(c.r, 0.5);
        assert_eq!(c.g, 0.5);
        assert_eq!(c.b, 0.5);
        assert_eq!(c.a, 1.0);
    }

    #[test]
    fn test_color_from_bytes() {
        let c = Color::from_bytes(255, 128, 64, 255);
        assert!((c.r - 1.0).abs() < 0.01);
        assert!((c.g - 0.5).abs() < 0.01);
        assert!((c.b - 0.25).abs() < 0.01);
        assert!((c.a - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_color_to_css() {
        let c = Color::new(1.0, 0.5, 0.0, 0.8);
        let css = c.to_css();
        assert!(css.contains("255"));
        assert!(css.contains("127")); // 0.5 * 255 = 127.5 -> 127
        assert!(css.contains("0"));
        assert!(css.contains("0.8"));
    }

    #[test]
    fn test_color_constants() {
        assert_eq!(Color::BLACK.r, 0.0);
        assert_eq!(Color::WHITE.r, 1.0);
        assert_eq!(Color::RED.r, 1.0);
        assert_eq!(Color::GREEN.g, 1.0);
        assert_eq!(Color::BLUE.b, 1.0);
    }

    #[test]
    fn test_color_blend() {
        let c1 = Color::BLACK;
        let c2 = Color::WHITE;
        let c3 = c1.blend(c2, 0.5);

        assert!((c3.r - 0.5).abs() < 0.01);
        assert!((c3.g - 0.5).abs() < 0.01);
        assert!((c3.b - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_color_with_alpha() {
        let c = Color::WHITE.with_alpha(0.5);
        assert!((c.a - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_sprite_creation() {
        let s = Sprite::new(100.0, 200.0);
        assert_eq!(s.width, 100.0);
        assert_eq!(s.height, 200.0);
        assert_eq!(s.opacity, 1.0);
    }

    #[test]
    fn test_sprite_builder() {
        let s = Sprite::new(50.0, 50.0)
            .with_color(Color::RED)
            .with_opacity(0.8);

        assert_eq!(s.color, Color::RED);
        assert!((s.opacity - 0.8).abs() < 0.01);
    }

    #[test]
    fn test_render_queue_creation() {
        let q = RenderQueue::new();
        assert!(q.is_empty());
        assert_eq!(q.len(), 0);
    }

    #[test]
    fn test_render_queue_clear() {
        let mut q = RenderQueue::new();
        q.clear(Color::BLACK);

        assert_eq!(q.len(), 1);
        assert!(!q.is_empty());
    }

    #[test]
    fn test_render_queue_draw() {
        let mut q = RenderQueue::new();
        let sprite = Sprite::new(100.0, 100.0);
        let transform = Mat3::identity();

        q.draw_sprite(sprite, transform);
        assert_eq!(q.len(), 1);
    }

    #[test]
    fn test_render_queue_flush() {
        let mut q = RenderQueue::new();
        q.clear(Color::BLACK);
        q.draw_sprite(Sprite::new(50.0, 50.0), Mat3::identity());
        q.present();

        assert_eq!(q.len(), 3);
        q.flush();
        assert_eq!(q.len(), 0);
    }

    #[test]
    fn test_render_queue_commands() {
        let mut q = RenderQueue::new();
        q.clear(Color::WHITE);
        q.present();

        let commands = q.commands();
        assert_eq!(commands.len(), 2);
    }
}

