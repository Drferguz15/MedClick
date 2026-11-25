const $ = s => document.querySelector(s);
const api = async (url, options={}) => {
  const r = await fetch('/api'+url, { credentials:'same-origin', headers:{'Content-Type':'application/json',...(options.headers||{})}, ...options });
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || 'Ocurrió un error.');
  return data;
};
let currentUser=null, activeKind='PACIENTE';
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3800)}
function showAuth(which){$('#authView').classList.remove('hidden');$('#appView').classList.add('hidden');$('#loginCard').classList.toggle('hidden',which!=='login');$('#registerCard').classList.toggle('hidden',which!=='register')}
$('#showRegister').onclick=e=>{e.preventDefault();showAuth('register')};
$('#showLogin').onclick=e=>{e.preventDefault();showAuth('login')};
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setKind(b.dataset.kind));
function setKind(kind){activeKind=kind;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.kind===kind));$('#patientFields').classList.toggle('hidden',kind!=='PACIENTE');$('#doctorFields').classList.toggle('hidden',kind!=='MEDICO');$('#registerBtn').textContent=kind==='PACIENTE'?'Registrarme como paciente':'Solicitar registro médico';$('#registerNotice').textContent=kind==='PACIENTE'?'El paciente se registra gratuitamente y podrá consultar su historial.':'La cuenta médica quedará pendiente hasta que el administrador verifique el pago y active la suscripción.'}
$('#registerForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=new FormData(e.target),password=f.get('password');
 if(password!==f.get('confirmPassword'))return toast('Las contraseñas no coinciden.');
 try{
  let body,endpoint;
  if(activeKind==='PACIENTE'){endpoint='/registro/paciente';body={nombre:f.get('nombre'),carnet:f.get('carnet'),fechaNacimiento:f.get('fechaNacimiento'),sexo:f.get('sexo'),correo:f.get('correo'),password};}
  else{endpoint='/registro/medico';body={nombre:f.get('nombreMedico'),matricula:f.get('matricula'),correo:f.get('correoMedico'),password};}
  const d=await api(endpoint,{method:'POST',body:JSON.stringify(body)});toast(d.message);e.target.reset();showAuth('login');
 }catch(err){toast(err.message)}
});
$('#registerForm [name="fechaNacimiento"]').addEventListener('change',e=>{
 if(!e.target.value)return;const d=new Date(e.target.value+'T00:00:00'),today=new Date();let age=today.getFullYear()-d.getFullYear();if(today.getMonth()<d.getMonth()||(today.getMonth()===d.getMonth()&&today.getDate()<d.getDate()))age--;$('#edad').value=age>=0?age:'';
});
$('#loginBtn').onclick=async()=>{
 try{const d=await api('/login',{method:'POST',body:JSON.stringify({identificador:$('#loginId').value,password:$('#loginPassword').value,rol:$('#loginRole').value})});currentUser=d.user;showApp();}
 catch(e){toast(e.message)}
};
async function boot(){try{const d=await api('/me');currentUser=d.user;showApp()}catch{}}
function showApp(){ $('#authView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#welcome').textContent='Bienvenido, '+currentUser.nombre;$('#userChip').textContent=currentUser.rol;buildNav();loadPage('inicio');}
function buildNav(){
 const menus={PACIENTE:[['inicio','Inicio'],['citas','Agendar cita'],['historial','Mi historial']],MEDICO:[['inicio','Inicio'],['pacientes','Pacientes'],['nuevo','Registrar consulta'],['historial','Consultas realizadas'],['citas','Citas']],ADMIN:[['inicio','Inicio'],['medicos','Médicos y suscripciones'],['pagos','Historial de pagos']]};
 $('#navigation').innerHTML=menus[currentUser.rol].map(([id,t])=>`<button class="nav-item" data-page="${id}">◇ ${t}</button>`).join('');
 document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>loadPage(b.dataset.page));
}
$('#logoutBtn').onclick=async()=>{try{await api('/logout',{method:'POST'})}catch{}currentUser=null;showAuth('login')};
async function loadPage(page){
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const c=$('#content');c.innerHTML='<div class="panel">Cargando información…</div>';
 try{
  if(page==='inicio')return renderHome();
  if(page==='pacientes')return renderPatients();
  if(page==='nuevo')return renderNewConsultation();
  if(page==='historial')return renderHistory();
  if(page==='citas')return renderAppointments();
  if(page==='medicos')return renderDoctors();
  if(page==='pagos')return renderPayments();
 }catch(e){c.innerHTML=`<div class="panel">${esc(e.message)}</div>`}
}
function esc(v=''){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function shell(title,sub,body){$('#content').innerHTML=`<h1 class="page-title">${title}</h1><p class="sub">${sub}</p>${body}`}
async function renderHome(){
 const role=currentUser.rol;
 if(role==='PACIENTE'){
  const [h,c]=await Promise.all([api('/mis-consultas'),api('/citas')]);
  shell('Panel del paciente','Consulta tus citas y revisa tu historial médico.',`<div class="cards"><div class="stat"><small>Consultas registradas</small><strong>${h.length}</strong></div><div class="stat"><small>Citas solicitadas</small><strong>${c.length}</strong></div></div><div class="panel"><h3>Tu información</h3><p>Tu historial es de solo lectura. Para corregir datos personales, contacta al consultorio.</p></div>`);
 }else if(role==='MEDICO'){
  const [p,h,c]=await Promise.all([api('/pacientes'),api('/mis-consultas'),api('/citas')]);
  shell('Panel médico','Resumen de tu actividad profesional.',`<div class="cards"><div class="stat"><small>Pacientes registrados</small><strong>${p.length}</strong></div><div class="stat"><small>Consultas realizadas</small><strong>${h.length}</strong></div><div class="stat"><small>Citas</small><strong>${c.length}</strong></div><div class="stat"><small>Suscripción</small><strong style="font-size:17px">${esc(currentUser.suscripcionEstado||'PENDIENTE')}</strong></div></div><div class="panel"><h3>Acceso a funciones clínicas</h3><p>Los registros clínicos existentes se conservan aunque tu suscripción venza. Para registrar nuevas consultas debes tener la suscripción activa.</p></div>`);
 }else{
  const m=await api('/admin/medicos');
  shell('Panel de administración','Control general de médicos y suscripciones.',`<div class="cards"><div class="stat"><small>Médicos registrados</small><strong>${m.length}</strong></div><div class="stat"><small>Activos</small><strong>${m.filter(x=>x.SuscripcionEstado==='ACTIVA').length}</strong></div><div class="stat"><small>Pendientes / vencidos</small><strong>${m.filter(x=>x.SuscripcionEstado!=='ACTIVA').length}</strong></div></div><div class="panel"><h3>Gestión responsable</h3><p>La administración de pagos no elimina, modifica ni bloquea los historiales clínicos almacenados.</p></div>`);
 }
}
async function renderPatients(){
 const p=await api('/pacientes');
 shell('Pacientes','Registra una ficha para un paciente que todavía no tiene cuenta.',`<div class="panel"><h3>Registro asistido de paciente</h3><form id="assistForm" class="form-grid">
 <div><label>Nombre completo</label><input name="nombre" required></div><div><label>Carnet</label><input name="carnet" required></div>
 <div><label>Fecha de nacimiento</label><input name="fechaNacimiento" type="date" required></div><div><label>Sexo</label><select name="sexo"><option value="">Sin especificar</option><option>Femenino</option><option>Masculino</option><option>Otro</option></select></div>
 <div class="wide"><label>Correo (opcional)</label><input name="correo" type="email"></div><div class="wide"><button class="btn primary">Crear ficha de paciente</button></div></form><p class="muted">Entrega al paciente su carnet. Luego podrá crear una cuenta gratuita con el mismo carnet y vincularse a esta ficha.</p></div>
 <div class="panel"><h3>Pacientes registrados (${p.length})</h3><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Carnet</th><th>Fecha nacimiento</th><th>Correo</th></tr></thead><tbody>${p.map(x=>`<tr><td>${esc(x.NombreCompleto)}</td><td>${esc(x.Carnet)}</td><td>${new Date(x.FechaNacimiento).toLocaleDateString('es-BO')}</td><td>${esc(x.Correo||'-')}</td></tr>`).join('')}</tbody></table></div></div>`);
 $('#assistForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const d=await api('/pacientes/asistido',{method:'POST',body:JSON.stringify(b)});toast(d.message);renderPatients()}catch(x){toast(x.message)}};
}
async function renderNewConsultation(){
 const p=await api('/pacientes');
 shell('Registrar consulta','Completa los datos clínicos. La consulta se añadirá cronológicamente al expediente.',`<form id="consultForm" class="panel">
 <div class="form-grid"><div class="wide"><label>Paciente</label><select name="pacienteId" required><option value="">Seleccionar paciente</option>${p.map(x=>`<option value="${x.PacienteID}">${esc(x.NombreCompleto)} — CI ${esc(x.Carnet)}</option>`).join('')}</select></div>
 <div><label>Motivo de consulta</label><textarea name="motivo"></textarea></div><div><label>Enfermedad actual</label><textarea name="enfermedad"></textarea></div>
 <div><label>Examen físico</label><textarea name="examen"></textarea></div><div><label>Diagnóstico</label><textarea name="diagnostico" required></textarea></div>
 <div class="wide"><label>Tratamiento</label><textarea name="tratamiento"></textarea></div><div class="wide"><label>Observaciones</label><textarea name="observaciones"></textarea></div>
 <div class="wide"><h3>Signos vitales</h3></div>
 <div><label>Peso (kg)</label><input name="peso" type="number" step="0.01"></div><div><label>Talla (cm)</label><input name="talla" type="number" step="0.1"></div>
 <div><label>Presión arterial (ej. 120/80)</label><input name="pa"></div><div><label>Frecuencia cardíaca (lpm)</label><input name="fc" type="number"></div>
 <div><label>Frecuencia respiratoria (rpm)</label><input name="fr" type="number"></div><div><label>Temperatura (°C)</label><input name="temperatura" type="number" step="0.1"></div>
 <div><label>Saturación O₂ (%)</label><input name="saturacion" type="number" step="0.1"></div><div><label>Glicemia (mg/dl)</label><input name="glicemia" type="number" step="0.1"></div>
 <div class="wide"><h3>Receta / medicamentos</h3><p class="muted">Agrega uno o más medicamentos si corresponde.</p><div id="medRows"></div><button type="button" class="btn secondary" id="addMed">+ Agregar medicamento</button></div>
 </div><div class="form-actions"><button class="btn primary">Guardar consulta</button></div></form>`);
 const add=()=>{const d=document.createElement('div');d.className='form-grid';d.innerHTML=`<div><label>Medicamento</label><input class="med-name"></div><div><label>Dosis</label><input class="med-dose"></div><div><label>Frecuencia</label><input class="med-freq"></div><div><label>Duración</label><input class="med-dur"></div><div class="wide"><label>Indicaciones</label><input class="med-ind"></div>`;$('#medRows').append(d)};
 $('#addMed').onclick=add;add();
 $('#consultForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),v=Object.fromEntries(f);const recetas=[...document.querySelectorAll('#medRows .form-grid')].map(r=>({medicamento:r.querySelector('.med-name').value,dosis:r.querySelector('.med-dose').value,frecuencia:r.querySelector('.med-freq').value,duracion:r.querySelector('.med-dur').value,indicaciones:r.querySelector('.med-ind').value}));const body={pacienteId:v.pacienteId,motivo:v.motivo,enfermedad:v.enfermedad,examen:v.examen,diagnostico:v.diagnostico,tratamiento:v.tratamiento,observaciones:v.observaciones,signos:{peso:v.peso,talla:v.talla,pa:v.pa,fc:v.fc,fr:v.fr,temperatura:v.temperatura,saturacion:v.saturacion,glicemia:v.glicemia},recetas};try{const d=await api('/consultas',{method:'POST',body:JSON.stringify(body)});toast(`${d.message} IMC: ${d.imc??'No calculado'}`);loadPage('historial')}catch(x){toast(x.message)}};
}
async function renderHistory(){
 const h=await api('/mis-consultas'),patient=currentUser.rol==='PACIENTE';
 shell(patient?'Mi historial clínico':'Consultas realizadas','Registros ordenados desde el más reciente. Los datos clínicos son de solo lectura para el paciente.',`<div class="panel">${h.length?h.map(x=>`<article class="record"><h4>${new Date(x.FechaConsulta).toLocaleString('es-BO')} · ${esc(patient?'Atención médica':'Paciente: '+(x.Paciente||''))}</h4><p><b>${patient?'Profesional:':'Diagnóstico:'}</b> ${esc(patient?x.Medico:x.Diagnostico)}</p>${patient?`<p><b>Diagnóstico:</b> ${esc(x.Diagnostico)}</p><p><b>Tratamiento:</b> ${esc(x.Tratamiento||'No registrado')}</p><p><b>Signos:</b> Peso ${esc(x.PesoKg??'-')} kg · Talla ${esc(x.TallaCm??'-')} cm · PA ${esc(x.PresionArterial??'-')} · IMC ${esc(x.IMC??'-')}</p>`:''}${!patient?`<button class="btn secondary" onclick="downloadPdf(${x.ConsultaID})">Descargar PDF</button>`:''}</article>`).join(''):'<div class="empty">Todavía no hay consultas registradas.</div>'}</div>`);
}
window.downloadPdf=async id=>{try{const r=await fetch(`/api/consultas/${id}/pdf`);if(!r.ok){const d=await r.json();throw new Error(d.error)}const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`MedClick-consulta-${id}.pdf`;a.click();URL.revokeObjectURL(url)}catch(e){toast(e.message)}};
async function renderAppointments(){
 if(currentUser.rol==='PACIENTE'){
  const [medicos,citas]=await Promise.all([api('/medicos'),api('/citas')]);
  shell('Agendar cita virtual','Solicita una cita con el profesional o especialidad que necesites.',`<div class="panel"><form id="appointmentForm" class="form-grid">
   <div><label>Profesional</label><select name="medicoId" required><option value="">Seleccionar</option>${medicos.map(m=>`<option value="${m.UsuarioID}">${esc(m.NombreCompleto)}</option>`).join('')}</select></div>
   <div><label>Especialidad</label><select name="especialidad" required><option>Medicina general</option><option>Pediatría</option><option>Ginecología</option><option>Medicina interna</option></select></div>
   <div><label>Fecha y hora</label><input name="fechaHora" type="datetime-local" required></div>
   <div><label>Plataforma preferida</label><select name="plataforma"><option>WhatsApp</option><option>Zoom</option></select></div>
   <div class="wide"><label>Motivo de consulta</label><textarea name="motivo"></textarea></div>
   <div class="wide"><label>Enlace de reunión (si ya lo tienes)</label><input name="enlace" placeholder="https://..."></div>
   <div class="wide"><button class="btn primary">Solicitar cita</button></div></form></div>
   <div class="panel"><h3>Mis citas</h3>${citas.map(x=>`<div class="record"><b>${new Date(x.FechaHora).toLocaleString('es-BO')}</b><p>${esc(x.Medico)} · ${esc(x.Especialidad)} · ${esc(x.Estado)}</p>${x.EnlaceTeleorientacion?`<a href="${esc(x.EnlaceTeleorientacion)}" target="_blank" rel="noopener">Abrir teleorientación</a>`:''}</div>`).join('')||'<p class="empty">No tienes citas.</p>'}</div>`);
  $('#appointmentForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const d=await api('/citas',{method:'POST',body:JSON.stringify(b)});toast(d.message);renderAppointments()}catch(x){toast(x.message)}};
 }else{
  const c=await api('/citas');shell('Agenda de citas','Revisa las solicitudes de atención.',`<div class="panel"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Paciente</th><th>Especialidad</th><th>Modalidad</th><th>Estado</th><th>Enlace</th></tr></thead><tbody>${c.map(x=>`<tr><td>${new Date(x.FechaHora).toLocaleString('es-BO')}</td><td>${esc(x.Paciente||'-')}</td><td>${esc(x.Especialidad)}</td><td>${esc(x.Modalidad)}</td><td>${esc(x.Estado)}</td><td>${x.EnlaceTeleorientacion?`<a href="${esc(x.EnlaceTeleorientacion)}" target="_blank" rel="noopener">Abrir</a>`:'-'}</td></tr>`).join('')}</tbody></table></div></div>`);
 }
}
async function renderDoctors(){
 const m=await api('/admin/medicos');
 shell('Médicos y suscripciones','Verifica pagos, activa cuentas y controla vencimientos.',`<div class="panel"><div class="table-wrap"><table><thead><tr><th>Médico</th><th>Matrícula</th><th>Cuenta</th><th>Suscripción</th><th>Vence</th><th>Estado</th></tr></thead><tbody>${m.map(x=>`<tr><td>${esc(x.NombreCompleto)}</td><td>${esc(x.MatriculaProfesional)}</td><td>${esc(x.EstadoCuenta)}</td><td>${esc(x.SuscripcionEstado||'SIN REGISTRO')}</td><td>${x.FechaVencimiento?new Date(x.FechaVencimiento).toLocaleDateString('es-BO'):'-'}</td><td><span class="pill ${x.SuscripcionEstado==='ACTIVA'?'':'pending'}">${esc(x.EstadoPago||'PENDIENTE')}</span></td></tr>`).join('')}</tbody></table></div></div>
 <div class="panel"><h3>Verificación de pago</h3><p>Para activar una suscripción registra el pago en la sección Sistema de pagos. No se elimina ni bloquea el historial clínico.</p><button class="btn primary" onclick="loadPage('pagos')">Ir al sistema de pagos</button></div>`);
}
async function renderPayments(){
 const [m,p]=await Promise.all([api('/admin/medicos'),api('/admin/pagos')]);
 shell('Sistema de pagos y suscripciones','Registra pagos, activa o suspende suscripciones y consulta el historial.',`<div class="panel"><h3>Registrar pago de médico</h3><form id="paymentForm" class="form-grid">
 <div class="wide"><label>Médico</label><select name="medicoId" required><option value="">Seleccionar médico</option>${m.map(x=>`<option value="${x.UsuarioID}">${esc(x.NombreCompleto)} — ${esc(x.MatriculaProfesional)}</option>`).join('')}</select></div>
 <div><label>Monto</label><input name="monto" type="number" min="0.01" step="0.01" required></div><div><label>Fecha de pago</label><input name="fechaPago" type="date" required value="${new Date().toISOString().slice(0,10)}"></div>
 <div><label>Periodo (meses)</label><input name="periodoMeses" type="number" min="1" value="1"></div><div><label>Método</label><select name="metodo"><option>Transferencia QR</option><option>Depósito bancario</option><option>Efectivo</option><option>Otro</option></select></div>
 <div><label>Número de referencia</label><input name="referencia"></div><div><label>Observación</label><input name="observacion"></div>
 <div class="wide"><button class="btn primary">Registrar pago y activar</button></div></form>
 <div class="form-actions"><img class="qr-preview" src="assets/qr-banco.png" alt="Coloca aquí tu QR bancario" onerror="this.style.display='none'"><p class="muted">Reemplaza <b>public/assets/qr-banco.png</b> por tu código QR bancario.</p></div></div>
 <div class="panel"><h3>Historial de pagos</h3><div class="table-wrap"><table><thead><tr><th>Médico</th><th>Monto</th><th>Fecha</th><th>Periodo</th><th>Método</th><th>Referencia</th></tr></thead><tbody>${p.map(x=>`<tr><td>${esc(x.Medico)}</td><td>${Number(x.Monto).toFixed(2)}</td><td>${new Date(x.FechaPago).toLocaleDateString('es-BO')}</td><td>${x.PeriodoMeses} mes(es)</td><td>${esc(x.Metodo||'-')}</td><td>${esc(x.Referencia||'-')}</td></tr>`).join('')||'<tr><td colspan="6">No hay pagos registrados.</td></tr>'}</tbody></table></div></div>
 <div class="panel"><h3>Activar o suspender suscripción</h3><form id="statusForm" class="form-grid"><div><label>Suscripción</label><select name="id" required>${m.filter(x=>x.SuscripcionID).map(x=>`<option value="${x.SuscripcionID}">${esc(x.NombreCompleto)} (#${x.SuscripcionID})</option>`).join('')}</select></div><div><label>Nuevo estado</label><select name="estado"><option>ACTIVA</option><option>SUSPENDIDA</option><option>PENDIENTE</option></select></div><div class="wide"><button class="btn secondary">Actualizar estado</button></div></form></div>`);
 $('#paymentForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const d=await api('/admin/pagos',{method:'POST',body:JSON.stringify(b)});toast(d.message);renderPayments()}catch(x){toast(x.message)}};
 $('#statusForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const d=await api(`/admin/suscripciones/${b.id}/estado`,{method:'POST',body:JSON.stringify({estado:b.estado})});toast(d.message);renderPayments()}catch(x){toast(x.message)}};
}
boot();
