Bandai Namco UI Design Token Extraction Report (Extended)

This report details the raw UI design tokens extracted from publicly accessible Bandai Namco web portals, enterprise dashboards, and application interfaces. The analysis expands beyond login screens to include actual application environments, utilizing both computed CSS styles from live pages and visual analysis of official application screenshots.

1. Application Interfaces & Dashboards

The following tokens were extracted from actual application environments and dashboard shells, representing the internal or authenticated user experience.

Bandai Namco Creator Collective Dashboard

The Creator Collective dashboard provides a modern, dark-themed enterprise interface. The following tokens were extracted directly from the computed CSS of the dashboard shell [1].

Token Category
Element
Value
Color
Sidebar Background
rgb(30, 41, 59) (Dark Slate Blue)
Color
Main Content Background
rgb(15, 23, 42) (Very Dark Navy)
Color
Active Navigation Link
rgb(51, 65, 85) (Muted Blue-Gray)
Color
Sign-In Button Background
rgba(85, 85, 242, 0.6) (Translucent Violet/Blue)
Color
Text (General)
rgb(255, 255, 255) (White)
Typography
Global Font Family
Poppins, sans-serif
Typography
Base Font Size
16px
Typography
Base Line Height
24px
Typography
Base Font Weight
400
Component
Sign-In Button
Border Radius: 10px




BANDAI TCG+ Mobile Application

The BANDAI TCG+ application represents a consumer-facing utility app. Tokens were extracted via visual analysis of official instructional screenshots provided by Bandai Namco [2].

Token Category
Element
Observed Value
Color
Main Background
White
Color
Bottom Navigation Bar
Very Dark Navy / Black
Color
Active Tab Indicator
Pink
Color
Primary CTA Button Fill
Pale Pink
Color
Primary CTA Button Border
Strong Pink
Color
Primary CTA Button Text
Strong Pink
Color
Decorative Accents
Aqua/Cyan and Pale Yellow blobs
Color
Text (Primary)
Black
Component
List Items / Settings Rows
White cards with thin gray borders and rounded corners
Component
Notification Icon
Circular dark button with a pink notification dot
Component
Dividers
Thin, light gray horizontal lines




BANDAI TCG+ Web Portal Landing Page

The landing page for the TCG+ application utilizes a clean, spacious design. Tokens were extracted via visual analysis of the live page [3].

Token Category
Element
Observed Value
Color
Page Background
Very Light Gray / Off-White
Color
Feature Headings
Saturated Blue
Color
Body Text
Dark Gray
Color
Decorative Blobs
Aqua/Cyan and Pale Pink
Component
Content Cards
White fill, medium-large corner radius, gray border/shadow outline
Spacing
Section Gaps
Generous vertical spacing between major content blocks




2. Corporate & B2B Portals

The following tokens were extracted from the computed CSS of Bandai Namco's corporate and B2B-facing web portals.

Bandai Namco Holdings Global Portal

The global corporate portal utilizes a structured, professional design system [4].

Token Category
Element
Value
Typography
Global Font Family
"Noto Sans Japanese"
Typography
Navigation Link Text
Size: 15.72px, Weight: 700, Color: rgb(0, 0, 0)
Typography
Main Heading (H2)
Size: 28.30px, Weight: 400, Color: rgb(255, 255, 255), Letter Spacing: 2.83px
Typography
Secondary Heading (H3)
Size: 29.09px, Weight: 700, Color: rgb(230, 0, 0)
Typography
Footer Link Text
Size: 14.15px, Weight: 700, Color: rgb(0, 0, 0)
Component
Navigation Card Container
Background: rgb(247, 247, 247), Box Shadow: rgba(0, 0, 0, 0.1) 0px 4.72px 7.86px 1.57px




Bandai Namco Europe Media/Influencer Registration

This portal serves as a B2B entry point for media and influencers [5].

Token Category
Element
Value
Color
Submit Button
Background: rgb(255, 173, 0) (Orange), Border: rgb(255, 173, 0), Text: rgb(255, 255, 255)
Color
Input Field
Background: rgb(255, 255, 255), Border: rgb(0, 0, 0), Text: rgb(0, 0, 0)
Color
Select Field
Background: rgb(255, 255, 255), Border: rgb(204, 204, 204), Text: rgb(85, 85, 85)
Color
Sub Heading Text
rgb(30, 36, 77) (Dark Blue)
Typography
Global Font Family
Metropolis, Gotham, "Helvetica Neue", Helvetica, Arial, sans-serif
Typography
Submit Button Text
Size: 14px, Weight: 400, Letter Spacing: 1.4px
Typography
Main Heading (H1)
Size: 54px, Weight: 900, Letter Spacing: -0.48px
Component
Input Field
Border Radius: 12px, Padding: 17px 60px 16px 30px
Component
Select Field
Border Radius: 4px, Padding: 6px 28px 6px 12px, Box Shadow: rgba(0, 0, 0, 0.075) 0px 1px 1px 0px inset
Component
Submit Button
Border Radius: 3px, Padding: 12px 15px




3. Authentication Interfaces

While primarily login screens, these interfaces provide insight into form design and button styling across different regional portals.

Bandai Namco Europe Login Portal

Token Category
Element
Value
Color
Primary Button
Background: rgb(226, 6, 19) (Red), Border: rgb(226, 6, 19), Text: rgb(255, 255, 255)
Color
Input Field
Background: rgb(255, 255, 255), Border: rgb(251, 96, 106) (Light Red), Text: rgb(0, 0, 0)
Typography
Global Font Family
Metropolis, Gotham, "Helvetica Neue", Helvetica, Arial, sans-serif
Typography
Primary Button Text
Size: 14px, Weight: 600, Letter Spacing: 1.12px
Typography
Input Field Text
Size: 20px, Weight: 500
Component
Primary Button
Border Radius: 12px, Padding: 26px 30px 25px
Component
Input Field
Border Radius: 12px, Padding: 22px 22px 19px, Margin Bottom: 30px




Bandai Namco ID Login Portal

Token Category
Element
Value
Color
Link Text
rgb(230, 0, 0) (Red)
Typography
Global Font Family
source-sans-pro
Typography
Heading (H1)
Font Family: source-sans-pro-bold, Size: 32px, Weight: 700
Component
Login Button
Background: Transparent, Border: None, Text: White, Padding: 0px 24px
Component
Main Container
Background: rgb(255, 255, 255), Border Radius: 8px, Padding: 40px




Conclusion

The analysis reveals that Bandai Namco does not employ a single, monolithic design system across all its digital properties. Instead, design tokens vary significantly depending on the target audience and the specific application.

Enterprise and creator-focused dashboards, such as the Creator Collective, lean towards modern, dark-themed interfaces utilizing the Poppins font family and slate/navy color palettes. Consumer applications like TCG+ favor bright, white interfaces with strong accent colors (pink, cyan) and distinct card-based layouts. Corporate portals rely heavily on Noto Sans Japanese or Metropolis/Gotham font stacks, with a more traditional use of the brand's signature red, white, and black colors.

References

1.
Bandai Namco Creator Collective Dashboard

2.
BANDAI TCG+ Application Instructional Images

3.
BANDAI TCG+ Landing Page

4.
Bandai Namco Holdings Global Portal

5.
Bandai Namco Europe Media/Influencer Registration