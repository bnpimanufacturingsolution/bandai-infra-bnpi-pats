static const char *attendance_status_from_sdk_byte(unsigned byte_value) {
    switch (byte_value) {
        case 1:
            return "checkIn";
        case 2:
            return "checkOut";
        case 3:
            return "breakOut";
        case 4:
            return "breakIn";
        case 5:
            return "overtimeIn";
        case 6:
            return "overtimeOut";
        default:
            return "undefined";
    }
}

static const char *attendance_label_from_status(const std::string &status) {
    if (status == "checkIn") return "Check In";
    if (status == "checkOut") return "Check Out";
    if (status == "breakOut") return "Break Out";
    if (status == "breakIn") return "Break In";
    if (status == "overtimeIn") return "Overtime In";
    if (status == "overtimeOut") return "Overtime Out";
    if (status == "undefined") return "Unset";
    return "";
}
