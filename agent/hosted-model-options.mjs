export const HOSTED_MODEL_OPTIONS=[
  {id:'openai/gpt-5.6-terra',label:'Terra medium',effort:'medium'},
  {id:'deepseek/deepseek-v4.1-flash',label:'DeepSeek V4.1 Flash low',effort:'low'},
  {id:'z-ai/glm-5.3',label:'GLM 5.3 high',effort:'high'},
];

export function hostedModelSettings(model='deepseek/deepseek-v4.1-flash',effort){
  const option=HOSTED_MODEL_OPTIONS.find(item=>item.id===model);
  if(!option||effort&&effort!==option.effort)throw new Error('Choose one of the evaluated model configurations.');
  return {model:option.id,effort:option.effort,label:option.label};
}
