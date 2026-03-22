# Design System Strategy: The Precision Atelier

## 1. Overview & Creative North Star
The creative North Star for this design system is **"The Precision Atelier."** 

In a world of cluttered, noisy shop management tools, this system acts as a high-end digital workshop—organized, calm, and infinitely capable. We are moving away from the "generic SaaS" look by replacing rigid grid lines with tonal planes. We treat the interface not as a collection of boxes, but as a series of layered surfaces that feel like fine stationery or brushed stone. 

By leveraging intentional asymmetry, generous whitespace, and a high-contrast typographic scale, we transform data density from "overwhelming" to "authoritative." The result is a dashboard that feels less like a spreadsheet and more like a curated command center.

---

## 2. Color & Tonal Architecture
The palette centers on organic stone and warm grays to reduce eye strain, punctuated by a high-energy "Electric Blue" for intent and action.

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders are strictly prohibited for defining sections. 
Boundaries must be created through background color shifts. For example, a `surface_container_low` (#fcf2eb) card should sit on a `surface` (#fff8f5) background. The eye perceives the edge through the shift in value, creating a sophisticated, "borderless" look that feels integrated rather than boxed-in.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the `surface_container` tiers to define depth:
- **Base Layer:** `surface` (#fff8f5) for the primary canvas.
- **Structural Sections:** `surface_container` (#f6ece6) for side panels or utility bars.
- **Interactive Elements:** `surface_container_lowest` (#ffffff) for cards or inputs to provide a "lifted" feel.
- **Deep Sidebar:** `inverse_surface` (#342f2b) provides the "Deep Charcoal" weight needed to ground the navigation.

### The "Glass & Gradient" Rule
To elevate beyond flat design, use Glassmorphism for floating overlays (Modals, Popovers). Use `surface` colors at 80% opacity with a `24px` backdrop-blur. 
For primary actions, utilize a subtle linear gradient from `primary` (#0050cb) to `primary_container` (#0066ff) at a 135-degree angle. This adds a "lithographic" depth to buttons that flat hex codes cannot achieve.

---

## 3. Typography: Editorial Authority
We use **Inter** as our sole typeface, relying on extreme weight and scale variance to provide hierarchy.

- **Metrics & Data:** Use `label-sm` (0.6875rem) or `label-md` (0.75rem). These must be **UPPERCASE** with a letter-spacing of `0.05rem` to feel like a high-end watch face or technical instrument.
- **The Power of Scale:** Use `display-sm` (2.25rem) for primary business KPIs. The contrast between a massive numeric value and a tiny, uppercase label creates the "Editorial" feel.
- **Body & Information:** `body-md` (0.875rem) is our workhorse. Ensure a line-height of 1.5 to maintain the "calm" atmosphere even in data-dense tables.

---

## 4. Elevation & Depth
In this system, depth is a function of light and layering, not structural scaffolding.

### The Layering Principle
Avoid "Drop Shadows" for layout. Instead, use "Tonal Stacking." Place a `surface_container_lowest` element atop a `surface_dim` section. The subtle contrast (stone vs. white) creates a natural edge.

### Ambient Shadows
When an element must float (e.g., a dragged card or a dropdown):
- **Blur:** Large (`16px` to `32px`).
- **Opacity:** Extremely low (4% to 8%).
- **Color:** Tint the shadow with `on_surface` (#1f1b17) rather than pure black. This mimics natural light reflecting off stone surfaces.

### The "Ghost Border" Fallback
If an element lacks sufficient contrast for accessibility, apply a **Ghost Border**: Use `outline_variant` (#c2c6d8) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons (The Action Signature)
- **Primary:** `primary` (#0050cb) fill with `on_primary` (#ffffff) text. Shape: `full` (pill). No border.
- **Secondary:** `surface_container_high` (#f0e6e0) fill. This should feel like a button carved out of the background.
- **Tertiary:** No fill. `primary` text. Use `3` (1rem) horizontal padding to maintain the "pill" footprint without a container.

### Cards & Metrics
- **Structure:** Cards must use `surface_container_lowest` (#ffffff) with a `DEFAULT` (0.5rem) or `md` (0.75rem) corner radius.
- **Prohibition:** No divider lines between card header and body. Use a `3` (1rem) spacing gap to separate content.
- **Badges:** Status badges (e.g., "Active", "Pending") must be pill-shaped (`full` roundedness), using `secondary_container` with a `0.85rem` font size.

### Inputs & Tables
- **Inputs:** Use `surface_container_low` (#fcf2eb) for the field background. On focus, shift the background to `surface_container_lowest` (#ffffff) and apply a `2px` `primary` "Ghost Border."
- **Data Tables:** Forbid the use of vertical or horizontal lines. Use `surface_container_high` on every other row for zebra-striping, or simply rely on `spacing scale 4` (1.4rem) between rows to create legibility through "Air."

### Shop-Specific Components
- **Inventory Heatmap:** Use a gradient scale from `surface_variant` to `primary` to show stock levels without using "stoplight" (red/green) colors that break the calm aesthetic.
- **Process Timeline:** A thin vertical track using `outline_variant` at 20% opacity, with `primary` dots for active stages.

---

## 6. Do’s and Don’ts

### Do
- **Do** use `spacing scale 10` (3.5rem) or `12` (4rem) for page margins. Luxury is defined by wasted space.
- **Do** use "Intended Asymmetry." Align metrics to the left and actions to the right, but allow for unexpected white space in the center to let the layout "breathe."
- **Do** use `primary_fixed_dim` for subtle hover states on blue elements to maintain a soft transition.

### Don’t
- **Don’t** use `100%` black (#000000) for text. Always use `on_surface` (#1f1b17) to keep the "Stone" warmth.
- **Don’t** use heavy shadows. If you can see the shadow clearly, it’s too dark.
- **Don’t** use "Default" Inter. Tighten the tracking on headings (`-0.02rem`) and loosen it on small labels (`+0.05rem`) for that custom-tooled look.
- **Don’t** crowd the sidebar. Use `spacing scale 6` between navigation items.