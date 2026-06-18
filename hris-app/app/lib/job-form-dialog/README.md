# Job Form Dialog - Atomic Design Implementation

## Overview

The JobFormDialog component has been refactored following atomic design principles and clean code practices.

## Structure

### Atoms (Basic UI Components)

- `Button`, `Input`, `Badge`, `Select`, `Modal` - Reusable UI primitives

### Molecules (Simple Combinations)

- **FormField.tsx** - Reusable form field wrappers with consistent styling
    - `FormField` - Generic field wrapper with label, error, and help text
    - `InputField` - Pre-configured input field
    - `TextAreaField` - Pre-configured textarea field
    - `SelectField` - Pre-configured select field
- **TagInput.tsx** - Complete tag management interface
    - Displays existing tags with remove functionality
    - Provides input for adding new tags
    - Handles tag variant selection

### Organisms (Complex Components)

- **job-form-dialog.tsx** - Main form dialog component
    - Orchestrates all molecules and atoms
    - Manages form state with react-hook-form
    - Handles business logic coordination

### Supporting Files

#### Constants (`constants.ts`)

- `JOB_TYPES` - Available job type options
- `TAG_VARIANTS` - Available tag color variants
- `DEFAULT_JOB_TYPE` - Default job type value
- `DEFAULT_TAG_VARIANT` - Default tag variant value

#### Types (`types.ts`)

- `JobFormData` - Form data structure
- `JobFormDialogProps` - Component props interface
- `JobFormInitialData` - Initial data structure
- `JobFormSubmitData` - Submit data structure

#### Custom Hooks

**useTagManager.ts**

- Manages tag state and operations
- Provides methods: `addTag`, `removeTag`, `resetTags`
- Handles new tag input state

**useLevelsByPosition.ts**

- Filters levels based on selected position
- Handles nested level data structures
- Returns `selectedPosition` and `availableLevels`

#### Utils (`utils.ts`)

- `transformPositionsToOptions` - Converts positions to select options
- `transformLevelsToOptions` - Converts levels to select options
- `getNoLevelsMessage` - Provides contextual placeholder messages
- `shouldDisableLevelSelect` - Determines if level select should be disabled

## Benefits

### Maintainability

- **Single Responsibility**: Each file has a clear, focused purpose
- **Easy to Test**: Isolated logic in hooks and utils
- **Clear Dependencies**: Import structure shows component relationships

### Scalability

- **Reusable Components**: FormField and TagInput can be used elsewhere
- **Easy to Extend**: Add new field types by creating new molecules
- **Flexible Hooks**: Custom hooks can be composed for new features

### Readability

- **Less Code**: Main component reduced from 300+ to ~150 lines
- **No Debug Logs**: Removed all console.log statements
- **Descriptive Names**: Clear, self-documenting function and variable names
- **Organized Structure**: Related code grouped in logical folders

## Migration Notes

No breaking changes - the component API remains the same. All refactoring is internal.
