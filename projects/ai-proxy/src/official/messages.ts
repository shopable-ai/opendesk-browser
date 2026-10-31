import {getEnvironment} from '../environment';
import type { OfficialRequest, OfficialResponse } from './contracts';

/** Only sanitized business DTOs may cross the background/UI boundary; never OAuth tokens. */
export async function requestOfficial(message: OfficialRequest): Promise<OfficialResponse> {
  try {
    const answer: unknown = await getEnvironment().official(message);
    if (!answer || typeof answer !== 'object' || !('ok' in answer))
      return {ok:false,failure:'operation-failed'};
    const response = answer as OfficialResponse;
    if (response.ok) return response;
    const allowed = ['not-configured','offline','invalid-response','unauthorized','forbidden',
      'rate-limited','cancelled','invalid-callback','busy','invalid-plan','unsupported',
      'operation-failed'];
    return allowed.includes(response.failure) ? response : {ok:false,failure:'operation-failed'};
  } catch { return {ok:false,failure:'operation-failed'}; }
}
