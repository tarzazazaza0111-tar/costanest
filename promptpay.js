// PromptPay QR text (Thai QR Payment, EMVCo): the shop's PromptPay ID + the amount to pay.
// payload("004666007086840") is the shop's own static QR; payload(id, 1590.37) is the same QR with the amount filled in.
var PP = (function () {
    function f(tag, value) { value = String(value); return tag + ("0" + value.length).slice(-2) + value; }
    function crc16(s) {
        var crc = 0xFFFF, i, j;
        for (i = 0; i < s.length; i++) {
            crc ^= s.charCodeAt(i) << 8;
            for (j = 0; j < 8; j++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xFFFF; }
        }
        return ("000" + crc.toString(16).toUpperCase()).slice(-4);
    }
    // phone 0812345678 -> 01 0066812345678, national / tax ID (13) -> 02, e-Wallet ID (15) -> 03
    function target(id) {
        var d = String(id || "").replace(/\D/g, "");
        if (d.length === 15) { return f("03", d); }
        if (d.length === 13) { return f("02", d); }
        if (d.length === 10 && d.charAt(0) === "0") { return f("01", "0066" + d.slice(1)); }
        throw new Error("PromptPay ID must be a phone number, a 13-digit ID or a 15-digit e-Wallet ID");
    }
    function payload(id, amount) {
        var amt = amount === undefined || amount === null || amount === "" ? null : Number(amount);
        if (amt !== null && !(amt > 0)) { throw new Error("bad amount"); }
        var s = f("00", "01") + f("01", amt ? "12" : "11") + f("29", f("00", "A000000677010111") + target(id)) + f("53", "764") +
                (amt ? f("54", amt.toFixed(2)) : "") + f("58", "TH") + "6304";
        return s + crc16(s);
    }
    return { payload: payload, crc16: crc16 };
})();
if (typeof module !== "undefined" && module.exports) { module.exports = PP; }
