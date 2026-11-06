/**
 * Shared ordering for PostgreSQL message timestamps.
 *
 * PostgreSQL stores timestamp fractions to microsecond precision, while
 * JavaScript Date.parse() keeps only milliseconds. Compare the epoch
 * milliseconds first, then the remaining six-digit fractional value, and
 * finally the message ID so pagination and confirmed-send overlays agree.
 */

/** @typedef {{id:string,created_at:string}} TimestampedMessage */

/** @param {string} timestamp */
function microsecondFraction(timestamp){
 const digits=/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/i.exec(timestamp)?.[1]??'';
 return Number(digits.padEnd(6,'0'));
}

/**
 * @param {TimestampedMessage} a
 * @param {TimestampedMessage} b
 * @returns {number}
 */
export function compareMessageTimestampAndId(a,b){
 const millis=Date.parse(a.created_at)-Date.parse(b.created_at);
 if(millis!==0)return millis;
 const fraction=microsecondFraction(a.created_at)-microsecondFraction(b.created_at);
 return fraction||a.id.localeCompare(b.id);
}
