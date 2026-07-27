# HRIS Design Audit - BANDAI Europe B2B Parity Prompt

## 1. Parity Analysis Table

### Colors

| Token / Property | Current Value in Codebase | Reference Value | Status |
|---|---|---|---|
| `--color-primary` | [`app/app.css`](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/app.css) sets `--primary` to `oklch(0.62 0.24 27)` in light mode and `oklch(0.65 0.24 27)` in dark mode; [`app/lib/config/theme.ts`](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/lib/config/theme.ts) also exports `#e60012` / orange-red variants; many screens override with `orange-600`, `red-600`, and gradients. | `rgb(226, 6, 19)` | DRIFT |
| `--color-primary-border` | Same primary red source as `--color-primary`; no separate border token exists. | `rgb(226, 6, 19)` | DRIFT |
| `--color-accent` | [`app/app.css`](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/app.css) duplicates primary red for `--accent`; [`app/lib/config/theme.ts`](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/lib/config/theme.ts) exports orange values such as `#f97907`; login and calendar surfaces use orange utilities. | `rgb(255, 173, 0)` | DRIFT |
| `--color-subheading` | No semantic token; current code uses `gray-500`, `gray-600`, `neutral-500`, and `orange-600` utilities. | `rgb(30, 36, 77)` | MISSING |
| `--color-input-bg` | Inputs/selects use `bg-background`, `bg-white`, and `bg-transparent` depending on component. | `rgb(255, 255, 255)` | DRIFT |
| `--color-input-border` | Borders are light gray via `--input` / `--border`, plus direct `border-gray-200` and `border-gray-300` overrides. | `rgb(0, 0, 0)` | DRIFT |
| `--color-select-border` | Current select borders are `border-input`, `border-gray-300`, and `border-neutral-200`. | `rgb(204, 204, 204)` | DRIFT |
| `--color-select-text` | Select text/placeholder colors use `text-muted-foreground`, `text-gray-500`, and `text-gray-600`. | `rgb(85, 85, 85)` | DRIFT |
| `--color-text-primary` | [`app/app.css`](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/app.css) maps body text to black via `--foreground`. | `rgb(0, 0, 0)` | MATCH |
| `--color-text-on-primary` | [`app/app.css`](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/app.css) maps primary foreground text to white via `--primary-foreground`. | `rgb(255, 255, 255)` | MATCH |

### Typography

| Token / Property | Current Value in Codebase | Reference Value | Status |
|---|---|---|---|
| `--font-family-base` | [`app/root.tsx`](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/root.tsx) imports `Inter` and `Outfit`; no `Metropolis` or `Gotham` match was found. | `Metropolis, Gotham, "Helvetica Neue", Arial, sans-serif` | MISSING |
| `--font-size-h1` | Shared headings use `text-3xl md:text-4xl`, `text-4xl xl:text-5xl`, and `text-3xl` patterns; no 54px h1 token exists. | `54px` | DRIFT |
| `--font-weight-h1` | Heading surfaces use `font-bold`, `font-semibold`, and some `font-black` overrides. | `900` | DRIFT |
| `--letter-spacing-h1` | Current implementations use `tracking-tight` and similar default Tailwind tracking utilities. | `-0.48px` | DRIFT and NEEDS CUSTOM CLASS |
| `--font-size-button` | Shared button primitives use `text-sm` (14px). | `14px` | MATCH |
| `--font-weight-button-primary` | Shared primary buttons use `font-medium`; some CTAs override to `font-semibold` or `font-bold`. | `600` | DRIFT |
| `--font-weight-button-submit` | Submit/login buttons often use `font-medium` or `font-bold`. | `400` | DRIFT |
| `--letter-spacing-button` | Current code uses `tracking-wide`, `tracking-wider`, and `tracking-widest` on uppercase labels. | `1.12px - 1.4px` | DRIFT and NEEDS CUSTOM CLASS |
| `--font-size-input` | Input/select primitives use `text-base`, `text-sm`, and `text-xs` rather than a 20px standard. | `20px` | DRIFT |
| `--font-weight-input` | No explicit input weight token exists; fields inherit default weight. | `500` | MISSING |

### Component Specs

| Token / Property | Current Value in Codebase | Reference Value | Status |
|---|---|---|---|
| `Input Field` | Shared inputs use `rounded-md`, `px-3 py-1` or `px-3 py-2`, `h-9` / `h-10`, and field groups use `space-y-2`. | `12px` radius, `22px 22px 19px` padding, `30px` field gap | DRIFT and NEEDS CUSTOM CLASS |
| `Select Field` | Shared selects use `rounded-md`, `px-3 py-1` or `px-3 py-2`, gray borders, and no inset shadow token. | `4px` radius, `6px 28px 6px 12px` padding, inset box-shadow | DRIFT and NEEDS CUSTOM CLASS |
| `Primary Button` | Shared buttons use `rounded-md`, `px-4 py-2`, `text-sm font-medium`; several primary CTAs override to `rounded-lg` gradients. | `12px` radius, `26px 30px 25px` padding, red bg, white text, `600` weight | DRIFT |
| `Submit Button` | Login/submit buttons commonly use `rounded-lg` / `h-11`, orange-red gradients, and `font-bold` or `font-medium`. | `3px` radius, `12px 15px` padding, orange bg, `400` weight | DRIFT |

## 2. Affected Files List

### `[DRIFT] --color-primary` / `--color-primary-border`

```text
[app/app.css](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/app.css)
[app/lib/config/theme.ts](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/lib/config/theme.ts)
[app/components/atoms/Button.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Button.tsx)
[app/components/atoms/Badge.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Badge.tsx)
[app/components/atoms/Checkbox.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Checkbox.tsx)
[app/components/atoms/Input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Input.tsx)
[app/components/atoms/Select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Select.tsx)
[app/components/ui/button.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/button.tsx)
[app/components/ui/input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/input.tsx)
[app/components/ui/select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/select.tsx)
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
[app/components/organisms/LoginHero.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginHero.tsx)
[app/components/templates/AuthTemplate.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/AuthTemplate.tsx)
[app/components/atoms/LoadingScreen.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/LoadingScreen.tsx)
[app/layouts/admin-layout.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/layouts/admin-layout.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
[app/components/atoms/SummaryCard.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/SummaryCard.tsx)
[app/components/molecules/TimesheetCalendar.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/molecules/TimesheetCalendar.tsx)
[app/components/organisms/TimesheetViewModal.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/TimesheetViewModal.tsx)
[app/routes/hr/payroll/SalaryReportTab.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/hr/payroll/SalaryReportTab.tsx)
[app/routes/employee/payroll/SalaryReportTab.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/employee/payroll/SalaryReportTab.tsx)
```

### `[DRIFT] --color-accent`

```text
[app/app.css](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/app.css)
[app/lib/config/theme.ts](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/lib/config/theme.ts)
[app/components/atoms/Badge.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Badge.tsx)
[app/components/atoms/status-badge.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/status-badge.tsx)
[app/components/ui/calendar.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/calendar.tsx)
[app/components/atoms/schedule-calendar.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/schedule-calendar.tsx)
[app/components/organisms/LoginHero.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginHero.tsx)
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
[app/components/atoms/LoadingScreen.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/LoadingScreen.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
[app/layouts/admin-layout.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/layouts/admin-layout.tsx)
[app/components/templates/cta-template.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/cta-template.tsx)
[app/components/templates/common/settings-template.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/common/settings-template.tsx)
[app/components/templates/common/payroll-management-template.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/common/payroll-management-template.tsx)
[app/components/atoms/FileDropzone.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/FileDropzone.tsx)
[app/components/atoms/DataTable.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/DataTable.tsx)
```

### `[MISSING] --color-subheading`

```text
[app/components/templates/AuthTemplate.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/AuthTemplate.tsx)
[app/components/organisms/LoginHero.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginHero.tsx)
[app/components/atoms/LoadingScreen.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/LoadingScreen.tsx)
[app/layouts/admin-layout.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/layouts/admin-layout.tsx)
[app/layouts/mobile-site-layout.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/layouts/mobile-site-layout.tsx)
[app/components/atoms/heading.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/heading.tsx)
[app/components/atoms/Text.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Text.tsx)
[app/components/atoms/typography.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/typography.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
```

### `[DRIFT] --color-input-bg` / `--color-input-border`

```text
[app/components/atoms/Input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Input.tsx)
[app/components/ui/input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/input.tsx)
[app/components/ui/textarea.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/textarea.tsx)
[app/components/atoms/Select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Select.tsx)
[app/components/ui/select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/select.tsx)
[app/components/ui/searchable-select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/searchable-select.tsx)
[app/components/atoms/form/form-input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-input.tsx)
[app/components/atoms/form/form-number-input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-number-input.tsx)
[app/components/atoms/form/form-select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-select.tsx)
[app/components/atoms/form/form-textarea.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-textarea.tsx)
[app/components/atoms/form/FormFieldGroup.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/FormFieldGroup.tsx)
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
```

### `[DRIFT] --color-select-border` / `--color-select-text`

```text
[app/components/atoms/Select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Select.tsx)
[app/components/ui/select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/select.tsx)
[app/components/ui/searchable-select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/searchable-select.tsx)
[app/components/atoms/form/form-select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-select.tsx)
[app/components/atoms/form/FormFieldGroup.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/FormFieldGroup.tsx)
[app/components/atoms/form/form-input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-input.tsx)
[app/components/atoms/form/form-textarea.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-textarea.tsx)
[app/components/atoms/form/form-number-input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-number-input.tsx)
[app/routes/admin/configuration/positions.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/admin/configuration/positions.tsx)
```

### `[MISSING] --font-family-base`

```text
[app/root.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/root.tsx)
[app/app.css](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/app.css)
[app/components/templates/AuthTemplate.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/AuthTemplate.tsx)
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
[app/components/organisms/LoginHero.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginHero.tsx)
[app/components/atoms/LoadingScreen.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/LoadingScreen.tsx)
[app/components/atoms/heading.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/heading.tsx)
[app/components/atoms/Text.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Text.tsx)
[app/components/atoms/typography.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/typography.tsx)
[app/layouts/admin-layout.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/layouts/admin-layout.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
```

### `[DRIFT] --font-size-h1` / `--font-weight-h1` / `--letter-spacing-h1`

```text
[app/components/atoms/heading.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/heading.tsx)
[app/components/atoms/Text.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Text.tsx)
[app/components/atoms/typography.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/typography.tsx)
[app/components/templates/AuthTemplate.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/AuthTemplate.tsx)
[app/components/organisms/LoginHero.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginHero.tsx)
[app/components/atoms/LoadingScreen.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/LoadingScreen.tsx)
```

### `[DRIFT] --font-weight-button-primary` / `--font-weight-button-submit` / `--letter-spacing-button`

```text
[app/components/atoms/Button.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Button.tsx)
[app/components/ui/button.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/button.tsx)
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
[app/components/atoms/form/status-button.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/status-button.tsx)
[app/components/modals/ChangePasswordModal.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/modals/ChangePasswordModal.tsx)
[app/components/modals/JobRequisitionRequestModal.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/modals/JobRequisitionRequestModal.tsx)
[app/components/organisms/LoginHero.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginHero.tsx)
[app/components/atoms/LoadingScreen.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/LoadingScreen.tsx)
[app/components/templates/cta-template.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/cta-template.tsx)
```

### `[DRIFT] --font-size-input` / `--font-weight-input`

```text
[app/components/atoms/Input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Input.tsx)
[app/components/ui/input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/input.tsx)
[app/components/ui/textarea.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/textarea.tsx)
[app/components/atoms/Select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Select.tsx)
[app/components/ui/select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/select.tsx)
[app/components/ui/searchable-select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/searchable-select.tsx)
[app/components/atoms/form/form-input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-input.tsx)
[app/components/atoms/form/form-number-input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-number-input.tsx)
[app/components/atoms/form/form-select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-select.tsx)
[app/components/atoms/form/form-textarea.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-textarea.tsx)
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
[app/routes/admin/configuration/positions.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/admin/configuration/positions.tsx)
```

### `[DRIFT] Input Field`

```text
[app/components/atoms/Input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Input.tsx)
[app/components/ui/input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/input.tsx)
[app/components/ui/textarea.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/textarea.tsx)
[app/components/atoms/form/form-input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-input.tsx)
[app/components/atoms/form/form-number-input.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-number-input.tsx)
[app/components/atoms/form/form-textarea.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-textarea.tsx)
[app/components/atoms/form/FormFieldGroup.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/FormFieldGroup.tsx)
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
```

### `[DRIFT] Select Field`

```text
[app/components/atoms/Select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Select.tsx)
[app/components/ui/select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/select.tsx)
[app/components/ui/searchable-select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/searchable-select.tsx)
[app/components/atoms/form/form-select.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/form-select.tsx)
[app/components/atoms/form/FormFieldGroup.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/FormFieldGroup.tsx)
[app/routes/admin/configuration/positions.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/admin/configuration/positions.tsx)
```

### `[DRIFT] Primary Button`

```text
[app/components/atoms/Button.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/Button.tsx)
[app/components/ui/button.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/ui/button.tsx)
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
[app/components/templates/cta-template.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/cta-template.tsx)
[app/components/templates/common/settings-template.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/common/settings-template.tsx)
[app/components/templates/common/payroll-management-template.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/templates/common/payroll-management-template.tsx)
[app/components/atoms/form/status-button.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/status-button.tsx)
[app/components/modals/ChangePasswordModal.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/modals/ChangePasswordModal.tsx)
[app/components/modals/JobRequisitionRequestModal.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/modals/JobRequisitionRequestModal.tsx)
```

### `[DRIFT] Submit Button`

```text
[app/components/organisms/LoginForm.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/LoginForm.tsx)
[app/routes/site/login.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/routes/site/login.tsx)
[app/components/modals/ChangePasswordModal.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/modals/ChangePasswordModal.tsx)
[app/components/modals/JobRequisitionRequestModal.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/modals/JobRequisitionRequestModal.tsx)
[app/components/organisms/leave-request-modal.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/organisms/leave-request-modal.tsx)
[app/components/atoms/form/status-button.tsx](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/components/atoms/form/status-button.tsx)
```

## 3. `tokens.css`

```css
:root {
  /* Colors */
  --color-primary: rgb(226, 6, 19); /* WAS: oklch(0.62 0.24 27) / #e60012 */
  --color-primary-border: rgb(226, 6, 19); /* WAS: same as --color-primary */
  --color-accent: rgb(255, 173, 0); /* WAS: oklch(0.62 0.24 27) / #f97907 */
  --color-subheading: rgb(30, 36, 77); /* WAS: gray/neutral/orange utility text */
  --color-input-bg: rgb(255, 255, 255); /* WAS: bg-background / bg-white / bg-transparent */
  --color-input-border: rgb(0, 0, 0); /* WAS: oklch(0.9 0 0) / border-gray-200 / border-gray-300 */
  --color-select-border: rgb(204, 204, 204); /* WAS: border-gray-300 / border-neutral-200 */
  --color-select-text: rgb(85, 85, 85); /* WAS: text-gray-500 / text-gray-600 / text-muted-foreground */
  --color-text-primary: rgb(0, 0, 0); /* MATCH */
  --color-text-on-primary: rgb(255, 255, 255); /* MATCH */

  /* Typography */
  --font-family-base: Metropolis, Gotham, "Helvetica Neue", Arial, sans-serif; /* WAS: Inter / Outfit */
  --font-size-h1: 54px; /* WAS: 36px-48px */
  --font-weight-h1: 900; /* WAS: font-bold / font-black */
  --letter-spacing-h1: -0.48px; /* WAS: tracking-tight; NEEDS CUSTOM CLASS */
  --font-size-button: 14px; /* MATCH */
  --font-weight-button-primary: 600; /* WAS: font-medium / font-bold */
  --font-weight-button-submit: 400; /* WAS: font-medium / font-bold */
  --letter-spacing-button: 1.12px; /* WAS: tracking-wide / tracking-wider; NEEDS CUSTOM CLASS */
  --font-size-input: 20px; /* WAS: 14px-16px */
  --font-weight-input: 500; /* WAS: default/inherited weight */

  /* Component Specs */
  --radius-input: 12px; /* WAS: rounded-md / rounded-lg */
  --padding-input: 22px 22px 19px; /* WAS: px-3 py-1 / px-3 py-2 */
  --input-field-gap: 30px; /* WAS: space-y-2 */
  --radius-select: 4px; /* WAS: rounded-md */
  --padding-select: 6px 28px 6px 12px; /* WAS: px-3 py-1 / px-3 py-2 */
  --shadow-select: inset 0 1px 2px rgba(0, 0, 0, 0.08); /* NEEDS CUSTOM CLASS */
  --radius-button-primary: 12px; /* WAS: rounded-md / rounded-lg */
  --padding-button-primary: 26px 30px 25px; /* WAS: px-4 py-2 / px-6 py-2.5 */
  --radius-button-submit: 3px; /* WAS: rounded-lg / rounded-md */
  --padding-button-submit: 12px 15px; /* WAS: py-3 / h-11 */
}
```

## 4. Equivalent `tailwind.config` extend block

The repo currently applies theme values in [`app/app.css`](C:/Users/uzaro/Documents/Projects/BANDA HRIS/hris-app/app/app.css) with Tailwind v4 `@theme`. This is the equivalent `extend` block if you backport the tokens into a classic `tailwind.config` file.

```ts
export default {
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-border": "var(--color-primary-border)",
        accent: "var(--color-accent)",
        subheading: "var(--color-subheading)",
        "input-bg": "var(--color-input-bg)",
        "input-border": "var(--color-input-border)",
        "select-border": "var(--color-select-border)",
        "select-text": "var(--color-select-text)",
        "text-primary": "var(--color-text-primary)",
        "text-on-primary": "var(--color-text-on-primary)",
      },
      fontFamily: {
        sans: ["var(--font-family-base)"],
      },
      fontSize: {
        h1: [
          "var(--font-size-h1)",
          {
            lineHeight: "1",
            letterSpacing: "var(--letter-spacing-h1)",
          },
        ],
        button: [
          "var(--font-size-button)",
          {
            lineHeight: "1.2",
            letterSpacing: "var(--letter-spacing-button)",
          },
        ],
        input: ["var(--font-size-input)", { lineHeight: "1.2" }],
      },
      fontWeight: {
        h1: "var(--font-weight-h1)",
        buttonPrimary: "var(--font-weight-button-primary)",
        buttonSubmit: "var(--font-weight-button-submit)",
        input: "var(--font-weight-input)",
      },
      letterSpacing: {
        h1: "var(--letter-spacing-h1)",
        button: "var(--letter-spacing-button)",
      },
      borderRadius: {
        input: "var(--radius-input)",
        select: "var(--radius-select)",
        buttonPrimary: "var(--radius-button-primary)",
        buttonSubmit: "var(--radius-button-submit)",
      },
      spacing: {
        "input-field-gap": "var(--input-field-gap)",
      },
      padding: {
        input: "var(--padding-input)",
        select: "var(--padding-select)",
        buttonPrimary: "var(--padding-button-primary)",
        buttonSubmit: "var(--padding-button-submit)",
      },
      boxShadow: {
        select: "var(--shadow-select)",
      },
    },
  },
};
```

## 5. Migration Tickets

---
**Ticket:** [DESIGN] Align `--color-primary` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --color-primary` / `--color-primary-border`
**Current Value:** `oklch(0.62 0.24 27)` / legacy `#e60012`, with orange/red overrides in shared primitives and login/layout surfaces
**Target Value:** `rgb(226, 6, 19)`
**Action:** Replace all brand red usages with `--color-primary` and update the shared theme mapping so the same red flows through buttons, badges, checkboxes, and other primary surfaces.
---

**Ticket:** [DESIGN] Align `--color-primary-border` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --color-primary` / `--color-primary-border`
**Current Value:** Same red source as `--color-primary`
**Target Value:** `rgb(226, 6, 19)`
**Action:** Replace the border-side brand red with `--color-primary-border` and keep it identical to the reference primary red.
---

**Ticket:** [DESIGN] Align `--color-accent` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --color-accent`
**Current Value:** `oklch(0.62 0.24 27)` in `app/app.css`, plus `#f97907` / orange-600 usage in the legacy palette and several hero/login/calendar surfaces
**Target Value:** `rgb(255, 173, 0)`
**Action:** Replace the current orange/red accent mix with `--color-accent` and wire accent surfaces through the shared theme and utility mappings.
---

**Ticket:** [DESIGN] Align `--color-subheading` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** Medium
**Affected Files:** see Step 2 block for `[MISSING] --color-subheading`
**Current Value:** No semantic token; current surfaces use gray and orange utility text classes
**Target Value:** `rgb(30, 36, 77)`
**Action:** Introduce `--color-subheading` and swap hero/login/loading/layout subheading text to the semantic token instead of ad hoc gray/orange utilities.
---

**Ticket:** [DESIGN] Align `--color-input-bg` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --color-input-bg` / `--color-input-border`
**Current Value:** Mixed `bg-background`, `bg-white`, and `bg-transparent`
**Target Value:** `rgb(255, 255, 255)`
**Action:** Normalize all shared input, select, and textarea surfaces to `--color-input-bg` and remove the transparent override path where it changes the intended background.
---

**Ticket:** [DESIGN] Align `--color-input-border` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --color-input-bg` / `--color-input-border`
**Current Value:** Light gray border tokens (`--input`, `--border`) and gray utility borders
**Target Value:** `rgb(0, 0, 0)`
**Action:** Replace the current gray input borders with `--color-input-border` in the shared input/select primitives and the form wrappers that override them.
---

**Ticket:** [DESIGN] Align `--color-select-border` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --color-select-border` / `--color-select-text`
**Current Value:** `border-gray-300`, `border-neutral-200`, and `border-input`
**Target Value:** `rgb(204, 204, 204)`
**Action:** Replace all select border styling with `--color-select-border` and update the select primitives, searchable select, and custom select wrappers to use the same border token.
---

**Ticket:** [DESIGN] Align `--color-select-text` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** Medium
**Affected Files:** see Step 2 block for `[DRIFT] --color-select-border` / `--color-select-text`
**Current Value:** `text-gray-500`, `text-gray-600`, and `text-muted-foreground`
**Target Value:** `rgb(85, 85, 85)`
**Action:** Replace placeholder/selection text on select controls with `--color-select-text` and remove the gray mismatch from the shared select stack.
---

**Ticket:** [DESIGN] Align `--font-family-base` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[MISSING] --font-family-base`
**Current Value:** `Inter` + `Outfit` from Google Fonts; no Metropolis/Gotham match was found
**Target Value:** `Metropolis, Gotham, "Helvetica Neue", Arial, sans-serif`
**Action:** Install or import the reference font stack, then remap `font-sans` to `--font-family-base` so the whole UI inherits the Bandai Europe typography.
---

**Ticket:** [DESIGN] Align `--font-size-h1` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --font-size-h1` / `--font-weight-h1` / `--letter-spacing-h1`
**Current Value:** H1 surfaces use `text-3xl md:text-4xl` and `text-4xl xl:text-5xl`
**Target Value:** `54px`
**Action:** Promote the shared heading styles and hero/login headers to the 54px h1 token and remove the smaller ad hoc h1 sizes.
---

**Ticket:** [DESIGN] Align `--font-weight-h1` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** Medium
**Affected Files:** see Step 2 block for `[DRIFT] --font-size-h1` / `--font-weight-h1` / `--letter-spacing-h1`
**Current Value:** `font-bold`, `font-semibold`, and `font-black`
**Target Value:** `900`
**Action:** Standardize the heading stack on the reference h1 weight so all title surfaces read as a single brand level.
---

**Ticket:** [DESIGN] Align `--letter-spacing-h1` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** Medium
**Affected Files:** see Step 2 block for `[DRIFT] --font-size-h1` / `--font-weight-h1` / `--letter-spacing-h1`
**Current Value:** `tracking-tight` and other ad hoc tracking utilities
**Target Value:** `-0.48px`
**Action:** Add the exact h1 letter-spacing token and use a custom class or arbitrary-value utility where the default Tailwind scale cannot express it precisely.
---

**Ticket:** [DESIGN] Align `--font-weight-button-primary` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --font-weight-button-primary` / `--font-weight-button-submit` / `--letter-spacing-button`
**Current Value:** Shared button primitives are `font-medium`; several CTAs override to `font-semibold` or `font-bold`
**Target Value:** `600`
**Action:** Update the shared primary button styles and downstream primary CTAs to use the 600 weight token consistently.
---

**Ticket:** [DESIGN] Align `--font-weight-button-submit` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --font-weight-button-primary` / `--font-weight-button-submit` / `--letter-spacing-button`
**Current Value:** Submit/login CTAs use `font-medium` or `font-bold`
**Target Value:** `400`
**Action:** Normalize submit-style buttons to the lighter 400 weight token so the submit CTA visually differs from the primary button.
---

**Ticket:** [DESIGN] Align `--letter-spacing-button` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** Medium
**Affected Files:** see Step 2 block for `[DRIFT] --font-weight-button-primary` / `--font-weight-button-submit` / `--letter-spacing-button`
**Current Value:** Ad hoc uppercase tracking utilities such as `tracking-wide`, `tracking-wider`, and `tracking-widest`
**Target Value:** `1.12px - 1.4px`
**Action:** Add the exact button tracking token and apply it through a custom class or arbitrary-value utility where the default Tailwind scale is not precise enough.
---

**Ticket:** [DESIGN] Align `--font-size-input` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] --font-size-input` / `--font-weight-input`
**Current Value:** Shared input/select primitives use `text-base`, `text-sm`, and `text-xs`
**Target Value:** `20px`
**Action:** Raise the shared input typography token to 20px and remove the smaller ad hoc size overrides from the input/select stack.
---

**Ticket:** [DESIGN] Align `--font-weight-input` to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** Medium
**Affected Files:** see Step 2 block for `[DRIFT] --font-size-input` / `--font-weight-input`
**Current Value:** Inputs currently inherit default weight and do not have a dedicated 500 token
**Target Value:** `500`
**Action:** Apply the 500 input weight token in the shared input/select primitives so the field family reads consistently across forms.
---

**Ticket:** [DESIGN] Align Input Field spec to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] Input Field`
**Current Value:** `rounded-md` / `rounded-lg`, `px-3 py-1` / `px-3 py-2`, `h-9` / `h-10`, and `space-y-2`
**Target Value:** `12px` radius, `22px 22px 19px` padding, `30px` field gap
**Action:** Replace the shared input wrappers with the reference radius/padding/gap tokens and remove the smaller field spacing pattern.
---

**Ticket:** [DESIGN] Align Select Field spec to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] Select Field`
**Current Value:** `rounded-md`, `px-3 py-1` / `px-3 py-2`, gray borders, and no inset shadow
**Target Value:** `4px` radius, `6px 28px 6px 12px` padding, inset box-shadow
**Action:** Replace the select trigger/content styling with the reference radius/padding and add the inset shadow via a custom class or arbitrary shadow value.
---

**Ticket:** [DESIGN] Align Primary Button spec to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] Primary Button`
**Current Value:** `rounded-md`, `px-4 py-2`, `text-sm font-medium`, with several `rounded-lg` gradient overrides
**Target Value:** `12px` radius, `26px 30px 25px` padding, red bg, white text, `600` weight
**Action:** Normalize the shared primary button and all primary CTAs to the reference radius, padding, color, and weight tokens.
---

**Ticket:** [DESIGN] Align Submit Button spec to BANDAI Europe B2B reference
**Type:** Design Debt
**Priority:** High
**Affected Files:** see Step 2 block for `[DRIFT] Submit Button`
**Current Value:** `rounded-lg` / `h-11`, orange-red gradients, `font-bold` or `font-medium`
**Target Value:** `3px` radius, `12px 15px` padding, orange bg, `400` weight
**Action:** Update submit-style buttons to the reference submit token and remove the larger gradient CTA treatment where it is acting as a submit button.
---

No files were modified. No additional recommendations were identified beyond the requested migration tickets.
