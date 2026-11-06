/**
 * Shared ordering for PostgreSQL message timestamps.
 *
 * PostgreSQL stores timestamp fractions to microsecond precision, while
 * JavaScript Date.parse() keeps only milliseconds. Compare the epoch
 * milliseconds first, then the remaining six-digit fractional value, and
 * finally the message ID so pagination and confirmed-send overlays agree.
 */
export type TimestampedMessage={id:string;created_at:string};

function microsecondFraction(timestamp:string):number{
 const digits=/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/i.exec(timestamp)?.[1]??'';
 return Number(digits.padEnd(6,'0'));
}

export function compareMessageTimestampAndId(
 a:TimestampedMessage,
 b:TimestampedMessage
):number{
 const millis=Date.parse(a.created_at)-Date.parse(b.created_at);
 if(millis!==0)return millis;
 const fraction=microsecondFraction(a.created_at)-microsecondFraction(b.created_at);
 return fraction||a.id.localeCompare(b.id);
}
