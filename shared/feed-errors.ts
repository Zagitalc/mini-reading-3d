/** Never persist raw exception messages: fetch errors may contain credential-bearing URLs. */
export function feedFailureReason(error:unknown):string {
 const message=error instanceof Error?error.message:'',name=error instanceof Error?error.name:'';
 const status=/^Bus provider returned HTTP (\d{3})$/.exec(message);
 if(status)return `Bus provider returned HTTP ${status[1]}`;
 if(name==='TimeoutError'||name==='AbortError')return 'Provider request timed out';
 if(message==='Bus provider returned an unrecognised response')return message;
 if(message==='Feed item exceeds storage budget'||message==='Feed snapshot exceeds free-plan storage budget')return message;
 if(message.startsWith('D1_'))return 'Feed storage operation failed';
 if(name==='TypeError')return 'Provider connection or response failed';
 return 'Provider update failed';
}
