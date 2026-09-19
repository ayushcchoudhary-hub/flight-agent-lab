const button=document.querySelector('#theme');
let dark=localStorage.getItem('flight-lab-theme')==='dark';
function render(){document.body.classList.toggle('dark',dark);button.textContent=dark?'Light mode':'Dark mode';}
button.onclick=()=>{dark=!dark;localStorage.setItem('flight-lab-theme',dark?'dark':'light');render();};
render();
