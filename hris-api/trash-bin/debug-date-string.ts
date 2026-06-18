// Test date string parsing
const dateStrings = ["1/5/2026", "1/13/2026", "1/14/2026"];

console.log("--- Testing Date String Parsing ---");

dateStrings.forEach(dateStr => {
    console.log(`\nInput: "${dateStr}"`);
    
    // Current logic
    const parsed = new Date(dateStr);
    console.log(`  new Date("${dateStr}"):`, parsed.toString());
    console.log(`  ISO:`, parsed.toISOString());
    
    // Recreate at midnight
    const recreated = new Date(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
        0, 0, 0, 0
    );
    console.log(`  Recreated:`, recreated.toString());
    console.log(`  ISO:`, recreated.toISOString());
    
    // Check if it shifted
    const inputDay = parseInt(dateStr.split('/')[1]);
    const outputDay = recreated.getDate();
    console.log(`  Input day: ${inputDay}, Output day: ${outputDay}, Match: ${inputDay === outputDay ? 'YES' : 'NO'}`);
});
