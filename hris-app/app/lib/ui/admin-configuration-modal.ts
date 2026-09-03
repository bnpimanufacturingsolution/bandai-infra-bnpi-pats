/**
 * Shared Modal shell classes for Admin → Configuration screens.
 * Keeps width, scroll, and chrome aligned (see levels, departments, holidays).
 */
export const HR_MODAL_BASE_CLASS =
	"max-h-[90vh] overflow-y-auto custom-scrollbar bg-slate-50 font-sans selection:bg-orange-100 selection:text-orange-900 border-none shadow-[0_20px_50px_rgba(0,0,0,0.1)]";

export const HR_MODAL_STANDARD_CLASS = `sm:max-w-[640px] ${HR_MODAL_BASE_CLASS}`;
export const HR_MODAL_WIDE_CLASS = `sm:max-w-[760px] ${HR_MODAL_BASE_CLASS}`;
/** Employee wizard: wider stepper + forms */
export const HR_MODAL_EMPLOYEE_CLASS = `sm:max-w-[min(960px,calc(100vw-2rem))] ${HR_MODAL_BASE_CLASS}`;
