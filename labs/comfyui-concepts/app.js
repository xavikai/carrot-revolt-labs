import { initI18n, tr, onLangChange, translate } from '../../i18n.js';
import dictionary from './i18n.js';

const $ = id => document.getElementById(id);
const tx = text => tr(text);
const nodes = [
  { name:'Load Checkpoint', type:'MODEL · CLIP · VAE', inputs:'A checkpoint file', action:'Loads three distinct components: the diffusion model that denoises, the text encoder that represents prompts, and the VAE that translates between latent data and pixels.', outputs:'MODEL, CLIP, VAE', example:'Changing the checkpoint changes the foundation used by the entire workflow.', misconception:'It does not output a finished image.' },
  { name:'Load LoRA', type:'MODEL · CLIP', inputs:'A compatible MODEL, CLIP, and LoRA file', action:'Applies learned weight adjustments to the model and, when supported, to its text encoder. Two strengths control those branches separately.', outputs:'Modified MODEL and CLIP', example:'A trained visual concept can influence generation without replacing the whole checkpoint.', misconception:'It is not a post-production filter on IMAGE.' },
  { name:'CLIP Text Encode (Prompt)', type:'CONDITIONING', inputs:'CLIP and prompt text', action:'Turns words into conditioning the sampler can use. Usually one node encodes the positive prompt and another the negative prompt.', outputs:'CONDITIONING', example:'The prompt describes content; the sampler receives its encoded representation.', misconception:'It does not draw the image or change the model weights.' },
  { name:'Empty Latent Image', type:'LATENT', inputs:'Width, height, batch size', action:'Creates an empty latent canvas with the requested dimensions. It determines the starting shape for text-to-image sampling.', outputs:'LATENT', example:'Changing width and height changes the target image dimensions.', misconception:'It is not a visible, pixel-based IMAGE.' },
  { name:'KSampler', type:'LATENT', inputs:'MODEL, positive and negative CONDITIONING, and LATENT', action:'Runs iterative denoising. Seed, steps, CFG, sampler, scheduler, and denoise settings affect how that process follows the conditions.', outputs:'Denoised LATENT', example:'With the same setup and seed, you can reproduce a sampling run; changing the seed changes its starting noise.', misconception:'Its output is still latent data, not a saved PNG.' },
  { name:'VAE Decode', type:'IMAGE', inputs:'Denoised LATENT and VAE', action:'Decodes the latent representation into visible pixel data using the VAE.', outputs:'IMAGE', example:'Place it after sampling when you need to preview or save pixels.', misconception:'It does not run the main denoising process.' },
  { name:'Save Image', type:'FILE', inputs:'IMAGE and filename prefix', action:'Writes the pixel image to an output file. This is an output node; it does not change the generated content.', outputs:'Saved image file', example:'A latent must be decoded to IMAGE before it can be saved here.', misconception:'It cannot save the raw LATENT as a regular image.' },
  { name:'Load Image', type:'IMAGE', inputs:'An image file', action:'Loads visible pixel data into the workflow. For ControlNet, that image can be prepared as a structural guide by a suitable preprocessor.', outputs:'IMAGE', example:'A source photo can be transformed into an edge map before Apply ControlNet.', misconception:'Loading a photo alone does not make it an edge, depth, or pose map.' },
  { name:'Load ControlNet Model', type:'CONTROL_NET', inputs:'A ControlNet model file', action:'Loads the specialised guidance model. It must suit the base model family and the kind of guide you plan to use.', outputs:'CONTROL_NET', example:'Choose an edge ControlNet for an edge guide and a compatible base checkpoint.', misconception:'This node does not load or preprocess the guide image.' },
  { name:'Apply ControlNet', type:'CONDITIONING', inputs:'Positive and negative CONDITIONING, CONTROL_NET model, guide IMAGE, strength, start and end', action:'Attaches structural guidance to the conditioning passed to the sampler. The guide influences generation over the selected part of sampling.', outputs:'Modified positive and negative CONDITIONING', example:'An edge map can steer outlines while the prompt describes the subject.', misconception:'It does not create the edge, depth, or pose map by itself.' }
];

const questions = [
  { prompt:'You have a denoised LATENT, but Save Image requires IMAGE. What is missing?', answers:['VAE Decode converts the latent to pixels.','Load LoRA converts the latent to pixels.','Another prompt encodes the latent.'], correct:0, why:'VAE Decode uses the VAE to turn latent samples into visible IMAGE data.' },
  { prompt:'You want the same learned character in new compositions. Which addition targets learned model behaviour?', answers:['A compatible LoRA.','An edge preprocessor.','Save Image.'], correct:0, why:'A LoRA applies trained weight adjustments to a compatible model; the prompt still describes the scene.' },
  { prompt:'You have a photo but want ControlNet to follow its outlines. What should you check first?', answers:['Prepare an edge guide with an appropriate preprocessor and choose a compatible ControlNet model.','Increase LoRA strength on the VAE.','Connect the photo directly to Save Image.'], correct:0, why:'Apply ControlNet consumes a guide; it does not extract the desired structure from the photo automatically.' }
];

let selectedNode = 0;
let guide = 'edges';
const guides = {
  edges:{ explanation:'Edges provide contours and boundaries. They guide where outlines appear, without specifying colours or textures.', svg:'<svg viewBox="0 0 280 150"><path d="M24 117h232M55 117V65l49-36 49 36v52M75 117V78h58v39M183 117V48h52v69M192 65h34M192 81h34M192 97h34"/></svg>' },
  depth:{ explanation:'Depth provides relative near and far structure. It guides spatial layout, not exact objects or colours.', svg:'<svg viewBox="0 0 280 150"><rect x="25" y="83" width="60" height="45" fill="#dce7df"/><rect x="97" y="56" width="72" height="72" fill="#a5b6b0"/><rect x="185" y="28" width="65" height="100" fill="#667b78"/><path d="M20 129h240"/></svg>' },
  pose:{ explanation:'Pose provides key body joints and limb positions. It guides a figure’s arrangement, not identity or clothing.', svg:'<svg viewBox="0 0 280 150"><circle cx="140" cy="28" r="12"/><path d="M140 40v48m0-29-40 22m40-22 42 17m-42 12-30 44m30-44 32 44"/><g class="joints"><circle cx="140" cy="59" r="4"/><circle cx="100" cy="81" r="4"/><circle cx="182" cy="76" r="4"/><circle cx="140" cy="88" r="4"/><circle cx="110" cy="132" r="4"/><circle cx="172" cy="132" r="4"/></g></svg>' }
};

function renderNodes(){
  $('node-list').innerHTML = nodes.map((node,i)=>`<button type="button" data-node="${i}" aria-pressed="${selectedNode===i}"><small>${String(i+1).padStart(2,'0')} · ${node.type}</small><strong>${node.name}</strong></button>`).join('');
  $('node-list').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{ selectedNode=Number(button.dataset.node); renderNodes(); }));
  const n=nodes[selectedNode];
  $('node-detail').innerHTML=`<div class="detail-top"><span class="eyebrow">NODE INSPECTOR</span><span class="type-chip">${n.type}</span></div><h3>${n.name}</h3><div class="io-grid"><div><small>INPUT</small><p>${tx(n.inputs)}</p></div><div><small>WHAT IT DOES</small><p>${tx(n.action)}</p></div><div><small>OUTPUT</small><p>${tx(n.outputs)}</p></div></div><div class="detail-callouts"><p><b>${tx('In practice')}</b> ${tx(n.example)}</p><p><b>${tx('Common mistake')}</b> ${tx(n.misconception)}</p></div>`;
  translate($('node-detail'));
}

function updateLora(){
  const model=Number($('model-strength').value), clip=Number($('clip-strength').value);
  $('model-value').value=model.toFixed(2); $('clip-value').value=clip.toFixed(2);
  $('model-meter').value=model; $('clip-meter').value=clip;
  $('model-explain').textContent=tx(model===0?'No model adjustment is applied; the sampler uses the base MODEL.':model<0.5?'A small adjustment is applied to the MODEL used for denoising.':model<=1?'The MODEL branch receives the LoRA adjustment.':'The MODEL adjustment exceeds 1; stronger can exaggerate or degrade results.');
  $('clip-explain').textContent=tx(clip===0?'The text encoder remains unchanged; prompts use the base CLIP.':clip<0.5?'A small adjustment is applied to CLIP before prompt encoding.':clip<=1?'The CLIP branch receives the LoRA adjustment before prompts are encoded.':'The CLIP adjustment exceeds 1; prompt interpretation may shift too strongly.');
}

function updateControl(){
  const strength=Number($('control-strength').value), start=Number($('start-percent').value), end=Number($('end-percent').value);
  $('control-value').value=strength.toFixed(2); $('start-value').value=start.toFixed(2); $('end-value').value=end.toFixed(2);
  $('timeline').firstElementChild.style.left=`${start*100}%`;
  $('timeline').firstElementChild.style.width=`${Math.max(0,end-start)*100}%`;
  $('control-explain').textContent=strength===0?tx('Strength 0 removes this guide’s influence.'):start===end?tx('Start and end are equal, so there is no active sampling interval.'):tr('The guide is active from {a}% to {b}% of sampling at strength {x}. This changes conditioning, not the source image.',{a:Math.round(start*100),b:Math.round(end*100),x:strength.toFixed(2)});
}

function renderGuide(){
  document.querySelectorAll('[data-guide]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guide===guide)));
  $('guide-visual').innerHTML=guides[guide].svg;
  $('guide-explain').textContent=tx(guides[guide].explanation);
}

function renderQuestions(){
  $('questions').innerHTML=questions.map((q,i)=>`<article class="question"><span class="eyebrow">${tr('CASE {n}',{n:i+1})}</span><h3>${tx(q.prompt)}</h3><div class="answers">${q.answers.map((a,j)=>`<button type="button" data-question="${i}" data-answer="${j}">${tx(a)}</button>`).join('')}</div><p class="answer-feedback" id="feedback-${i}" role="status" aria-live="polite"></p></article>`).join('');
  document.querySelectorAll('[data-answer]').forEach(button=>button.addEventListener('click',()=>{
    const i=Number(button.dataset.question), answer=Number(button.dataset.answer), q=questions[i];
    button.closest('.answers').querySelectorAll('button').forEach(b=>{b.classList.toggle('correct',Number(b.dataset.answer)===q.correct);b.classList.toggle('incorrect',b===button&&answer!==q.correct);});
    $('feedback-'+i).textContent=(answer===q.correct?tx('Correct. '):tx('Not quite. '))+tx(q.why);
  }));
}

function showSection(id){
  document.querySelectorAll('.chapter').forEach(section=>{const active=section.id===id;section.hidden=!active;section.classList.toggle('active',active);});
  document.querySelectorAll('[data-section]').forEach(button=>button.setAttribute('aria-current',String(button.dataset.section===id)));
}

document.querySelectorAll('[data-section]').forEach(button=>button.addEventListener('click',()=>showSection(button.dataset.section)));
document.querySelectorAll('[data-guide]').forEach(button=>button.addEventListener('click',()=>{guide=button.dataset.guide;renderGuide();}));
['model-strength','clip-strength'].forEach(id=>$(id).addEventListener('input',updateLora));
$('control-strength').addEventListener('input',updateControl);
['start-percent','end-percent'].forEach(id=>$(id).addEventListener('input',event=>{const start=$('start-percent'),end=$('end-percent');if(Number(start.value)>Number(end.value)){if(event.target===start)end.value=start.value;else start.value=end.value;}updateControl();}));
initI18n({dictionaries:[dictionary],mount:'.site-header',append:true});
onLangChange(()=>{renderNodes();updateLora();renderGuide();updateControl();renderQuestions();});
renderNodes();updateLora();renderGuide();updateControl();renderQuestions();
