import { ApiError,apiBoundary } from './lib/http.mjs';
export default function retired(request,response) {
  return apiBoundary(request,response,async()=>{
    throw new ApiError(410,'ENDPOINT_RETIRED','This legacy endpoint is no longer available.');
  });
}
