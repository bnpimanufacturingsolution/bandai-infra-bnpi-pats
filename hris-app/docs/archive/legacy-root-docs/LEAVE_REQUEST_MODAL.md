# Leave Request Modal Implementation

## Overview

A comprehensive leave request modal has been implemented for the employee leave management system. The modal provides a user-friendly interface for employees to submit leave requests with all the requested features.

## Features Implemented

### 1. Leave Type Selection

- **Vacation Leave** - For personal time off and holidays
- **Sick Leave** - For medical appointments and illness
- **Emergency Leave** - For urgent personal matters
- **Special Leave** - For other approved leave types

Each leave type shows:

- Visual icon representation
- Current remaining balance
- Disabled state when no balance available

### 2. Paid/Unpaid Leave Options

- **Paid Leave** - Uses available leave balance
- **Unpaid Leave** - Does not affect leave balance
- Visual toggle buttons with clear indicators

### 3. Date Range Selection

- **Start Date** - Date picker for leave start
- **End Date** - Date picker for leave end (automatically validates end > start)
- Real-time validation to prevent invalid date ranges

### 4. Auto-Calculation Features

- **Automatic Day Calculation** - Calculates total days between start and end dates (inclusive)
- **Balance Deduction** - Shows remaining balance after the requested leave
- **Real-time Updates** - Updates calculations as user changes dates or leave type
- **Visual Feedback** - Color-coded indicators (green for sufficient balance, red for insufficient)

### 5. Additional Features

- **Reason Field** - Required textarea for leave justification
- **Leave Balance Summary** - Shows current total, used, and remaining days
- **Form Validation** - Prevents submission with incomplete or invalid data
- **Responsive Design** - Works on desktop and mobile devices

## Technical Implementation

### Files Created/Modified

1. **`app/components/organisms/leave-request-modal.tsx`** - New modal component
2. **`app/routes/employee/leave.tsx`** - Updated to integrate the modal

### Key Components

- **Modal State Management** - Uses React useState for modal visibility
- **Form State** - Manages all form inputs and validation
- **Auto-calculation Logic** - useEffect hooks for real-time calculations
- **TypeScript Interfaces** - Proper typing for all data structures

### Integration Points

- **Leave Balances** - Passes current leave balances to modal
- **Submit Handler** - Processes form submission (ready for backend integration)
- **Button Triggers** - Multiple entry points to open the modal

## Usage

### Opening the Modal

The modal can be opened from multiple locations:

1. Main "Request Leave" button in the header
2. "Request Vacation Leave" button in Quick Actions
3. "Request Sick Leave" button in Quick Actions
4. "Request Emergency Leave" button in Quick Actions

### Form Workflow

1. **Select Leave Type** - Choose from available leave types
2. **Choose Paid/Unpaid** - Select whether leave is paid or unpaid
3. **Set Date Range** - Pick start and end dates
4. **Review Calculation** - Check auto-calculated days and remaining balance
5. **Add Reason** - Provide justification for the leave
6. **Submit** - Submit the request (currently shows success alert)

### Validation Rules

- All fields are required
- End date must be after start date
- Cannot request more days than available balance
- Leave type must be selected
- Reason must be provided

## Future Enhancements

- Backend API integration for actual leave submission
- Email notifications for managers
- Leave policy validation
- Holiday calendar integration
- Team calendar conflict checking
- Leave request history updates

## Testing

The modal has been tested for:

- ✅ Form validation
- ✅ Auto-calculation accuracy
- ✅ Date range validation
- ✅ Leave balance checking
- ✅ Responsive design
- ✅ TypeScript type safety
- ✅ Linting compliance

## Browser Compatibility

- Modern browsers with ES6+ support
- Mobile responsive design
- Touch-friendly interface
