/**
 * Compare PostgreSQL timestamptz values without losing their microseconds.
 * Date.parse() keeps only milliseconds; the database cursor and ORDER BY
 * retain up to six fractional digits, so UI merges must use the same precision.
 */
function microsecondFraction(value:string):number{
 const fraction=/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1]??'';
 return Number(fraction.padEnd(6,'0'));
}

export function compareMessageTimestamps(a:string,b:string):number{
 const aMilliseconds=Date.parse(a),bMilliseconds=Date.parse(b);
 if(!Number.isFinite(aMilliseconds)||!Number.isFinite(bMilliseconds))return 0;
 const milliseconds=aMilliseconds-bMilliseconds;
 if(milliseconds!==0)return milliseconds;
 return microsecondFraction(a)-microsecondFraction(b);
}
