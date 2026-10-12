// A Provider lease cannot overwrite a real terminal Run with released
// resources and its matching original durable Result. This is not an
// authorization to dispatch a Worker or upload result data.
const TERMINAL=new Set(['completed','failed','stopped','interrupted']);

export function isDurableCloudResult(request,run,result){
  const ref=request?.runRef;
  return Boolean(ref&&run&&result&&
    run.cloudRequestId===request.requestId&&run.namespace===request.namespace&&
    TERMINAL.has(run.state)&&run.retirementState==='released'&&
    run.runId===ref.runId&&run.resultId===ref.resultId&&
    result.tag==='controller-result'&&result.runId===run.runId&&
    result.resultId===run.resultId&&result.namespace===run.namespace&&
    result.state===run.state&&result.revision?.sourceHash===ref.sourceHash);
}
