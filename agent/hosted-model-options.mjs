// Sonnet 5 is the default from 2026-09-27: on the 47 held-out cases it
// passed 42 against Terra's and Sol's 38 and made up no values in any tool
// call (Sol 9, Terra 1). Terra stays as a control.
export const DEFAULT_MODEL='anthropic/claude-sonnet-5';
export const HOSTED_MODEL_OPTIONS=[
  {id:'anthropic/claude-sonnet-5',label:'Sonnet 5 medium',effort:'medium'},
  {id:'openai/gpt-5.6-terra',label:'Terra medium',effort:'medium'},
  {id:'deepseek/deepseek-v4.1-flash',label:'DeepSeek V4.1 Flash low',effort:'low'},
  {id:'z-ai/glm-5.3',label:'GLM 5.3 high',effort:'high'},
];

export function hostedModelSettings(model=DEFAULT_MODEL,effort){
  const option=HOSTED_MODEL_OPTIONS.find(item=>item.id===model);
  if(!option||effort&&effort!==option.effort)throw new Error('Choose one of the evaluated model configurations.');
  return {model:option.id,effort:option.effort,label:option.label};
}
