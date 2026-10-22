/* =========================================================
   Marta Marina — Music Mind · Endpoint de formularios
   Google Apps Script Web App
   ---------------------------------------------------------
   Qué hace:
   - Newsletter (web): guarda el alta, le envía al momento el kit (dos
     audios) y te avisa por email. A los WELCOME_DELAY_DAYS días recibe el
     email de Marta con la infografía (sendPendingWelcomes, tarea diaria).
   - Landing: si marca la casilla opcional, también queda suscrito a la
     newsletter y recibe el email de Marta a los WELCOME_DELAY_DAYS días.
   - En la hoja, casillas ✓ con lo que ha recibido cada suscriptor.
   - Contacto (web): guarda el mensaje y te avisa por email.
  - Lead (landing de audio): guarda el lead, le envía los audios
     por email y te avisa.
   - En todos los casos registra el consentimiento (RGPD).
   - sendContactInvites(): invitación personal, una sola vez, a contactos de
     la agenda de Marta (INVITES). NO los suscribe: solo entran en la
     newsletter si se apuntan ellos desde la web.
   ========================================================= */

// ====== CONFIGURA ESTO ======================================
// 1) Email(s) donde quieres recibir los avisos (separados por coma).
var NOTIFY_EMAIL = 'maxim@hipeagency.es, hipebasketballagency@gmail.com, marta.marina@musicmind.es, martamarinachacon2@gmail.com';

// 2) Google Sheet donde se registra todo. Pestañas: SHEET_NAME (newsletter),
//    "Mensajes" (contacto) y LEADS_SHEET_NAME (landing). Se crean solas.
var SHEET_ID = '1KHgp_kiLbRdO7Bw5z3pSpuAlVPJwamV-xO8b3xnsZMg';
var SHEET_NAME = 'LEADS WEB MUSIC MIND';
var LEADS_SHEET_NAME = 'LEADS AUDIO';

// 3) Remitente de los emails que reciben los suscriptores.
//    Se envían desde la cuenta de Google que ejecuta este script; aquí solo
//    se fija el nombre visible y a qué dirección llegan las respuestas.
var SENDER_NAME = 'Marta Marina · Music Mind';
var SENDER_EMAIL = 'marta.marina@musicmind.es'; // debe estar añadido como alias "Enviar como" en la cuenta que ejecuta el script
var REPLY_TO = 'marta.marina@musicmind.es';
var SITE_URL = 'https://www.musicmind.es/';

// 4) Audio de bienvenida y audios del kit. Sube los MP3 a assets/audio/.
//    Si url está vacía, no se envía el email del audio (solo se registra).
var WELCOME_AUDIO = {
  title: 'Antes de entrar',
  url: 'https://www.musicmind.es/assets/audio/antes-de-entrar.mp3'
};
var KIT_AUDIOS = [
  {
    title: 'Antes de exponerte',
    description: 'Para los minutos previos a una reunión, una entrevista o un escenario. Escúchalo justo antes de entrar.',
    url: WELCOME_AUDIO.url,
    downloadUrl: SITE_URL + 'audios/?audio=antes-de-entrar#descargar'
  },
  {
    title: 'Después de un día duro',
    description: 'Para soltar lo que cargaste durante el día y volver a ti. Escúchalo cuando puedas cerrar los ojos un momento.',
    url: 'https://www.musicmind.es/assets/audio/kit-emergencia.mp3',
    downloadUrl: SITE_URL + 'audios/?audio=kit-emergencia#descargar'
  }
];
// 5) Email de Marta con la infografía (segundo email de la newsletter).
//    Si infographicUrl está vacía, no se envía (solo se registra).
var WELCOME = {
  subject: 'Un regalo para los primeros',
  infographicUrl: SITE_URL + 'assets/descargas/10-habitos-bienestar-industria-musical.jpg',
  kitUrl: SITE_URL + 'audios/'
};
// Llega WELCOME_DELAY_DAYS días después de suscribirse. No se envía nada antes
// de WELCOME_START: ese día lo reciben de golpe todos los suscriptores que ya
// existían (ver setupWelcomeTrigger).
var WELCOME_DELAY_DAYS = 4;
var WELCOME_START = '2026-10-24T17:00:00+02:00';   // viernes 24/10, 17:00 (Madrid)
var WELCOME_HOUR = 17;                              // hora diaria de envío

// 6) Invitación personal a contactos de la agenda de Marta (sendContactInvites).
//    Un email por persona, una sola vez. Nombre vacío → saluda con «Hola:».
var INVITE_SUBJECT = 'Un pequeño regalo de mi parte';
var INVITES_SHEET_NAME = 'INVITACIONES';
var INVITES = [
  ['samayax.ss@gmail.com', ''],
  ['mlramal@pons.es', ''],
  ['psicoterapiacrea@gmail.com', ''],
  ['alicia.arauzo.contacto@gmail.com', 'Alicia'],
  ['clarahachemusic@gmail.com', 'Clara'],
  ['olga@olgadepalma.com', 'Olga'],
  ['irigoyen.celia@gmail.com', 'Celia'],
  ['toboso.alicia@gmail.com', 'Alicia'],
  ['reinadepikas50@gmail.com', ''],
  ['marta.sanchez.ba@gmail.com', 'Marta'],
  ['maricruzdicarlo@gmail.com', 'Maricruz'],
  ['paulagalindovalle@gmail.com', 'Paula'],
  ['saramenach@gmail.com', 'Sara'],
  ['gemajy@gmail.com', '']
];

// Una entrada por landing. La clave es el MAGNET de la landing (kit-emergencia/index.html).
var LEAD_MAGNETS = {
  'kit-emergencia': {
    title: 'Tu kit de emergencia',
    audios: KIT_AUDIOS
  }
};
// ============================================================

// Texto EXACTO que el usuario acepta en cada formulario. Es la prueba de
// consentimiento (RGPD): guárdalo tal cual aparece en la web. Si cambias el
// texto en la web, actualiza también estas constantes (subiendo la versión)
// para que quede registrado a qué consintió cada persona y cuándo.
var CONSENT_VERSION = '2026-10-09';
var CONSENT_TEXT_CONTACT = 'He leído y acepto la política de privacidad y el tratamiento de mis datos para responder a mi consulta.';
var CONSENT_TEXT_NEWS = 'Acepto recibir la newsletter y la política de privacidad. Sin spam; puedes darte de baja cuando quieras.';
var CONSENT_TEXT_LEAD = 'He leído y acepto la política de privacidad y que se use mi email para enviarme estos audios.';
var CONSENT_TEXT_NEWS_LANDING = 'Quiero recibir también la newsletter de Music Mind. Puedes darte de baja cuando quieras.';

function doPost(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var type = p.type || 'newsletter';
    var email = (p.email || '').trim();
    var source = p.source || 'web';
    var consent = String(p.consent || '') === 'true';

    if (!isValidEmail(email)) {
      return json({ result: 'error', message: 'Email no válido.' });
    }

    // RGPD: sin consentimiento explícito no se guarda ni se procesa nada.
    if (!consent) {
      return json({ result: 'error', message: 'Falta el consentimiento.' });
    }

    var ts = new Date();
    var consentCell = 'Sí · v' + CONSENT_VERSION;

    if (type === 'contact') return handleContact(p, email, source, ts, consentCell);
    if (type === 'lead') return handleLead(p, email, source, ts, consentCell);
    return handleNewsletter(email, source, ts, consentCell);
  } catch (err) {
    return json({ result: 'error', message: 'Error interno: ' + err });
  }
}

// ---- Mensaje de contacto (formulario modal) ----
function handleContact(p, email, source, ts, consentCell) {
  var name = (p.name || '').trim();
  var message = (p.message || '').trim();
  if (!name || !message) {
    return json({ result: 'error', message: 'Faltan datos.' });
  }
  if (SHEET_ID) {
    var sheet = getSheet('Mensajes', ['Fecha', 'Nombre', 'Email', 'Mensaje', 'Origen', 'Consentimiento', 'Texto consentimiento']);
    sheet.appendRow([ts, name, email, message, source, consentCell, CONSENT_TEXT_CONTACT]);
  }
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    replyTo: email,
    subject: '✉ Nuevo mensaje · Music Mind — ' + name,
    htmlBody: notifyHtml('Nuevo mensaje desde la web', [
      ['Nombre', name], ['Email', email], ['Mensaje', message], ['Fecha', ts.toLocaleString()],
      ['Consentimiento', consentCell + ' — «' + CONSENT_TEXT_CONTACT + '»']
    ])
  });
  return json({ result: 'success', message: 'Mensaje enviado.' });
}

// ---- Alta en la newsletter (web) ----
// Columnas F-I: registro de qué ha recibido cada suscriptor (casillas ✓ + fecha).
var NEWS_COLS = ['Fecha', 'Email', 'Origen', 'Consentimiento', 'Texto consentimiento',
  '1 · Kit enviado', '2 · Bienvenida enviada', 'Fecha kit', 'Fecha bienvenida'];
var COL_KIT = 6, COL_WELCOME = 7, COL_KIT_DATE = 8, COL_WELCOME_DATE = 9;

function handleNewsletter(email, source, ts, consentCell) {
  var row = addSubscriber(email, source, ts, consentCell, CONSENT_TEXT_NEWS);
  var isNew = row !== 0;

  // Kit (dos audios) al momento, solo la primera vez. El email de Marta con la
  // infografía llega a los WELCOME_DELAY_DAYS días con sendPendingWelcomes().
  if (isNew && KIT_AUDIOS.length) {
    sendToSubscriber(email, 'Bienvenida a Music Mind · tu kit de emergencia', kitWelcomeHtml());
    markSent(row, COL_KIT, COL_KIT_DATE);
  }

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '✦ Nueva suscripción · Music Mind',
    htmlBody: notifyHtml('Nueva alta en la newsletter', [
      ['Email', email], ['Origen', source], ['Fecha', ts.toLocaleString()],
      ['Ya estaba suscrito', isNew ? 'No' : 'Sí (no se le reenvía nada)'],
      ['Consentimiento', consentCell + ' — «' + CONSENT_TEXT_NEWS + '»']
    ])
  });
  return json({ result: 'success', message: 'Suscripción registrada.' });
}

// Añade el email a la pestaña de newsletter si no estaba.
// Devuelve el número de fila nueva, 0 si ya existía o -1 si no hay hoja.
function addSubscriber(email, source, ts, consentCell, consentText) {
  if (!SHEET_ID) return -1;
  var sheet = getSheet(SHEET_NAME, NEWS_COLS);
  if (emailExists(sheet, 2, email)) return 0;
  sheet.appendRow([ts, email, source, consentCell, consentText]);
  var row = sheet.getLastRow();
  sheet.getRange(row, COL_KIT, 1, 2).insertCheckboxes();
  return row;
}

// Marca la casilla de un envío (✓) y anota la fecha en la fila del suscriptor.
function markSent(row, checkCol, dateCol) {
  if (!SHEET_ID || row < 2) return;
  var sheet = getSheet(SHEET_NAME, NEWS_COLS);
  sheet.getRange(row, checkCol).setValue(true);
  sheet.getRange(row, dateCol).setValue(new Date());
}

// ---- Lead desde una landing de audio ----
function handleLead(p, email, source, ts, consentCell) {
  var key = p.magnet || '';
  var magnet = LEAD_MAGNETS[key];
  if (!magnet) {
    return json({ result: 'error', message: 'Contenido no encontrado.' });
  }
  if (SHEET_ID) {
    var sheet = getSheet(LEADS_SHEET_NAME, ['Fecha', 'Email', 'Audio', 'Origen', 'Consentimiento', 'Texto consentimiento', 'Audios enviados', 'Newsletter']);
    sheet.appendRow([ts, email, key, source, consentCell, CONSENT_TEXT_LEAD]);
    // insertCheckboxes pone las casillas a «falso»; los valores se escriben después.
    var cb = sheet.getRange(sheet.getLastRow(), 7, 1, 2);
    cb.insertCheckboxes();
    cb.setValues([[!!(magnet.audios && magnet.audios.length), String(p.newsletter || '') === 'true']]);
  }
  // Casilla opcional de la landing: también se suscribe a la newsletter.
  var wantsNews = String(p.newsletter || '') === 'true';
  var subRow = wantsNews ? addSubscriber(email, source, ts, consentCell, CONSENT_TEXT_NEWS_LANDING) : 0;
  var newSubscriber = subRow !== 0;

  // Se envía siempre (aunque repita): quien lo pide otra vez probablemente lo ha perdido.
  if (magnet.audios && magnet.audios.length) {
    sendToSubscriber(email, magnet.title + ' · Music Mind', leadHtml(magnet, wantsNews));
    if (newSubscriber && key === 'kit-emergencia') markSent(subRow, COL_KIT, COL_KIT_DATE);
  }
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '♪ Nuevo lead · ' + magnet.title,
    htmlBody: notifyHtml('Nuevo lead desde la landing', [
      ['Email', email], ['Audio', key + ' · ' + magnet.title], ['Origen', source],
      ['Fecha', ts.toLocaleString()],
      ['Consentimiento', consentCell + ' — «' + CONSENT_TEXT_LEAD + '»'],
      ['Newsletter', wantsNews ? (newSubscriber ? 'Sí, nueva suscripción' : 'Sí (ya estaba suscrito)') : 'No']
    ])
  });
  return json({ result: 'success', message: 'Audios enviados.' });
}

// Healthcheck (abrir la URL en el navegador)
function doGet() {
  return json({ result: 'ok', message: 'MusicMind newsletter endpoint activo.' });
}

/* ---------- Plantillas de email (para el suscriptor) ----------
   HTML con tablas y estilos en línea: es lo que mejor se ve en Gmail,
   Outlook y Apple Mail. Los textos entre [corchetes] son PLACEHOLDER. */

// Primer email de la newsletter (al momento): el kit con los dos audios.
function kitWelcomeHtml() {
  return emailLayout({
    preheader: 'Gracias por unirte. Aquí tienes dos pausas guiadas para tener cerca.',
    eyebrow: 'Bienvenida',
    title: 'Dos pausas <em>para volver a ti.</em>',
    paragraphs: [
      'Hola:',
      'Aquí lo tienes. Los audios para dos de los momentos que más pesan.',
      'Guárdalos cerca. Son tuyos para cuando los necesites.',
      'Y si quieres contarme cómo te han ido, responde a este email. Los leo todos.'
    ],
    audioLinks: KIT_AUDIOS,
    closing: 'Un abrazo,<br>Marta',
    footer: NEWS_FOOTER
  });
}

// Segundo email de la newsletter (a los WELCOME_DELAY_DAYS días): texto de Marta
// con la infografía. Octubre 2026.
function welcomeHtml() {
  return emailLayout({
    preheader: 'Además del Kit de Emergencia, te mando 10 hábitos para tu bienestar en la industria musical.',
    eyebrow: 'Bienvenida',
    title: 'Un regalo <em>para los primeros.</em>',
    paragraphs: [
      'Hola,',
      'Llevo más o menos 7 años en un camino de autoconocimiento que no sé muy bien dónde me va a llevar, pero que ha cambiado por completo mi vida.',
      'Antes de 2019 era una chica con muchos miedos (algunos todavía salen de vez en cuando), muy complaciente, que intentaba eludir cualquier conflicto y alardeaba de tener un don: el poder adaptarme a cualquier persona, grupo o situación. Años más tarde entendí que esto no es un don, sino un síntoma de no saber quién eres y de no ser fiel a tus principios.',
      'Si me dicen que 7 años más tarde iba a estar escribiéndote un primer mail de bienvenida desde mi web… Mi web. Que todavía no me lo creo, en serio.',
      'Las cosas han ido pasando poco a poco, no por arte de magia, sino con mucha consciencia y trabajo interno. He ido construyendo a la persona que siempre he querido ser bajo una regla fundamental para mí: la <b>COHERENCIA</b>. Ser coherente me proporciona paz, bienestar y una sensación de plenitud. Y dado que a mí me ha funcionado, quiero compartirlo con todos.',
      'Emprender no es fácil. Vas contracorriente de muchas cosas que damos por normales — la disponibilidad permanente, el ritmo sin pausa, el «aguanta, que esto es así». Y a veces eso genera una ansiedad que no sabes muy bien de dónde viene.',
      'Pero cuando pienso en lo que puedo aportar a las personas que trabajan en esta industria, se me van todos los pensamientos de incertidumbre. Todos.',
      'Por eso hoy quiero darte algo más.',
      'Además del <a href="' + WELCOME.kitUrl + '" style="color:#2F4A55">Kit de Emergencia</a> (dos pausas guiadas para volver a ti), te mando una infografía con <b>10 hábitos para tu bienestar en la industria musical</b>. Los he elegido porque son los que a mí me han funcionado, y porque creo que marcan la diferencia entre sobrevivir un día o vivirlo de verdad.',
      'El primero de todos — y el más importante — tiene que ver con cómo te hablas a ti mismo. Porque lo que depende de ti, solo depende de ti. Y cuando eso está en orden, todo lo que viene de fuera, lo que no puedes controlar, lo enfrentas de una manera completamente diferente.'
    ],
    button: { text: '&#128073;&nbsp; Descarga aquí tu infografía', url: WELCOME.infographicUrl },
    closing: 'Gracias por estar aquí desde el principio.<br><br>Marta Marina',
    footer: NEWS_FOOTER
  });
}

var NEWS_FOOTER = 'Recibes este email porque te has suscrito a la newsletter de Music Mind en musicmind.es. Si no quieres recibir más emails, responde a este correo con la palabra «BAJA» y te daré de baja.';

function leadHtml(magnet, subscribed) {
  return emailLayout({
    preheader: 'Dos pausas guiadas para cuando la presión de la industria musical aprieta.',
    eyebrow: 'Tu kit de emergencia',
    title: 'Dos pausas <em>para volver a ti.</em>',
    paragraphs: [
      'Hola:',
      'Aquí lo tienes. Los audios para dos de los momentos que más pesan.',
      'Guárdalos cerca. Son tuyos para cuando los necesites.',
      'Y si quieres contarme cómo te han ido, responde a este email. Los leo todos.'
    ],
    audioLinks: magnet.audios,
    closing: 'Un abrazo,<br>Marta',
    footer: subscribed ? NEWS_FOOTER
      : 'Recibes este email porque lo has solicitado en musicmind.es. No te hemos suscrito a ninguna lista: solo te enviamos estos audios.'
  });
}

// Invitación personal a contactos de la agenda (no suscriptores).
function inviteHtml(name) {
  return emailLayout({
    preheader: 'He empezado un proyecto muy especial para mí y quería contártelo.',
    eyebrow: 'De Marta, para ti',
    title: 'Un pequeño regalo <em>de mi parte.</em>',
    paragraphs: [
      (name ? 'Hola, ' + escapeHtml(name) + ':' : 'Hola:'),
      'Te escribo porque te tengo en mi agenda y quería contarte, por si no lo sabías, que he empezado un proyecto muy especial para mí: <b>Music Mind</b>, un espacio de comunicación consciente y bienestar emocional para las personas que trabajamos en la industria musical.',
      'Si te apetece ver un poco de qué va, aquí tienes mi web: <a href="' + SITE_URL + '" style="color:#2F4A55">musicmind.es</a>.',
      'Y como ya formas parte de mi comunidad, te dejo un pequeño obsequio: mi kit de emergencia, dos pausas guiadas para volver a ti, y una <a href="' + WELCOME.infographicUrl + '" style="color:#2F4A55">infografía con 10 hábitos para tu bienestar en la industria musical</a>.'
    ],
    audioLinks: KIT_AUDIOS,
    afterAudio: [
      'Si te interesa estar al corriente de todas las novedades, puedes suscribirte a mi newsletter. Solo te llegará si te apuntas tú.'
    ],
    button: { text: 'Suscribirme a la newsletter', url: SITE_URL + '#newsletter' },
    closing: 'Muchas gracias por tu tiempo.<br><br>Un abrazo,<br>Marta',
    footer: 'Te escribo personalmente porque estás en mi agenda de contactos. No te he añadido a ninguna lista: solo recibirás la newsletter si te suscribes.'
  });
}

function emailLayout(o) {
  var ink = '#2F4A55', muted = '#4C6672', accent = '#5E7A87', bg = '#F1EAE1', surface = '#FBF7F1';
  var serif = "Georgia,'Times New Roman',serif", sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  var paras = o.paragraphs.map(function (t) {
    return '<p style="margin:0 0 16px;font-family:' + sans + ';font-size:16px;line-height:1.6;color:' + muted + '">' + t + '</p>';
  }).join('');
  // Decorative waveform built with tables so it also works without images.
  var wave = [10, 18, 28, 16, 36, 24, 42, 30, 18, 34, 46, 26, 38, 20, 32, 44, 24, 14, 30, 20, 38, 28, 16, 10].map(function (height) {
    return '<td width="8" align="center" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="3" height="' + height + '" style="background:' + accent + ';border-radius:3px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>';
  }).join('');
  var audioLinks = (o.audioLinks || []).map(function (audio, index) {
    var listenUrl = escapeHtml(audio.downloadUrl ? audio.downloadUrl.split('#')[0] : audio.url);
    var download = audio.downloadUrl ? '<a href="' + escapeHtml(audio.downloadUrl) + '" style="font-family:' + sans + ';font-size:14px;font-weight:600;color:' + ink + ';text-decoration:underline">Descargar audio &darr;</a>' : '';
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:' + bg + ';border:1px solid #DEDAD3;border-radius:16px"><tr><td style="padding:24px">' +
      '<p style="margin:0 0 10px;font-family:' + sans + ';font-size:10px;letter-spacing:2px;color:' + accent + '">AUDIO 0' + (index + 1) + ' &middot; MP3</p>' +
      '<h2 style="margin:0 0 10px;font-family:' + serif + ';font-size:23px;font-weight:400;color:' + ink + '">' + escapeHtml(audio.title) + '</h2>' +
      '<p style="margin:0 0 20px;font-family:' + sans + ';font-size:15px;line-height:1.6;color:' + muted + '">' + escapeHtml(audio.description) + '</p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>' +
        '<td width="58"><a href="' + listenUrl + '" aria-label="Escuchar ' + escapeHtml(audio.title) + '" style="display:inline-block;width:46px;line-height:46px;background:' + ink + ';border-radius:50%;font-family:Arial,sans-serif;font-size:20px;text-align:center;color:#ffffff;text-decoration:none">&#9658;</a></td>' +
        '<td><table role="presentation" aria-hidden="true" cellpadding="0" cellspacing="0" width="100%" height="48"><tr>' + wave + '</tr></table></td>' +
      '</tr></table>' +
      '<p style="margin:16px 0 0;font-family:' + sans + ';font-size:14px">' + download + '</p>' +
    '</td></tr></table>';
  }).join('');
  var title = o.title.replace(/<em>/g, '<em style="font-style:italic;color:' + accent + '">');
  return '' +
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:' + bg + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + o.preheader + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + bg + '"><tr><td align="center" style="padding:32px 16px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">' +
        '<tr><td align="center" style="padding:0 0 24px">' +
          '<a href="' + SITE_URL + '"><img src="' + SITE_URL + 'assets/logos/LOGO%20MM-04.png" alt="Marta Marina · Music Mind" width="300" style="display:block;width:300px;max-width:100%;height:auto;border:0"></a>' +
        '</td></tr>' +
        '<tr><td style="background:' + surface + ';border:1px solid rgba(58,61,64,.13);border-radius:24px;padding:40px 36px">' +
          '<p style="margin:0 0 14px;font-family:' + sans + ';font-size:11px;letter-spacing:3px;text-transform:uppercase;color:' + accent + '">' + o.eyebrow + '</p>' +
          '<h1 style="margin:0 0 24px;font-family:' + serif + ';font-weight:400;font-size:32px;line-height:1.15;color:' + ink + '">' + title + '</h1>' +
          paras +
          audioLinks +
          (o.afterAudio || []).map(function (t) {
            return '<p style="margin:0 0 16px;font-family:' + sans + ';font-size:16px;line-height:1.6;color:' + muted + '">' + t + '</p>';
          }).join('') +
          (o.button ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0"><tr><td style="background:' + ink + ';border-radius:100px">' +
            '<a href="' + o.button.url + '" style="display:inline-block;padding:14px 28px;font-family:' + sans + ';font-size:15px;font-weight:500;color:#ffffff;text-decoration:none">' + o.button.text + '</a>' +
          '</td></tr></table>' : '') +
          '<p style="margin:0;font-family:' + sans + ';font-size:16px;line-height:1.6;color:' + ink + '">' + o.closing + '</p>' +
        '</td></tr>' +
        '<tr><td style="padding:24px 12px 0;font-family:' + sans + ';font-size:12px;line-height:1.6;color:' + muted + ';text-align:center">' +
          o.footer + '<br><br>' +
          '<a href="' + SITE_URL + '" style="color:' + muted + '">musicmind.es</a> · ' +
          '<a href="' + SITE_URL + '#privacidad" style="color:' + muted + '">Política de privacidad</a>' +
        '</td></tr>' +
      '</table>' +
    '</td></tr></table></body></html>';
}

function sendToSubscriber(to, subject, html) {
  GmailApp.sendEmail(to, subject, 'Abre este email en un cliente que muestre HTML.', { htmlBody: html, name: SENDER_NAME, from: SENDER_EMAIL, replyTo: REPLY_TO });
}

// Aviso interno (para ti y Marta)
function notifyHtml(heading, rows) {
  return '<div style="font-family:Helvetica,Arial,sans-serif;color:#2F4A55">' +
    '<h2 style="font-weight:400">' + escapeHtml(heading) + '</h2>' +
    rows.map(function (r) {
      return '<p><b>' + escapeHtml(r[0]) + ':</b> <span style="white-space:pre-wrap">' + escapeHtml(r[1]) + '</span></p>';
    }).join('') +
    '</div>';
}

/* ---------- Utilidades ---------- */

// Devuelve la pestaña (la crea si no existe) y escribe la cabecera en la fila 1.
// Compatible con hojas antiguas: las columnas nuevas van al final.
function getSheet(name, cols) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
  return sheet;
}

function emailExists(sheet, col, email) {
  var rows = sheet.getLastRow() - 1;
  if (rows < 1) return false;
  return sheet.getRange(2, col, rows, 1).getValues()
    .some(function (r) { return String(r[0]).toLowerCase() === email.toLowerCase(); });
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Email de Marta (infografía), con retraso ----------
   Se ejecuta cada día a WELCOME_HOUR (ver setupWelcomeTrigger). Envía el email
   de Marta a cada suscriptor que lleve WELCOME_DELAY_DAYS días o más y aún no
   lo haya recibido (casilla «2 · Bienvenida enviada» sin marcar), y la marca.
   Antes de WELCOME_START no hace nada; ese día lo reciben todos los que ya
   estaban suscritos. Se salta los emails de prueba (@example.com). Si se agota
   la cuota diaria, el resto sale al día siguiente. */
function sendPendingWelcomes() {
  var now = new Date();
  if (now < new Date(WELCOME_START) || !WELCOME.infographicUrl) return;
  var sheet = getSheet(SHEET_NAME, NEWS_COLS);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var cutoff = new Date(now.getTime() - WELCOME_DELAY_DAYS * 24 * 3600 * 1000);
  var rows = sheet.getRange(2, 1, last - 1, COL_WELCOME).getValues();
  var sent = 0, pending = 0;
  for (var i = 0; i < rows.length; i++) {
    // Filas antiguas sin casillas: se crean aquí. (insertCheckboxes las pone a
    // «falso», por eso solo se aplica a filas que aún no tienen ninguna marca.)
    if (typeof rows[i][COL_KIT - 1] !== 'boolean') sheet.getRange(i + 2, COL_KIT, 1, 2).insertCheckboxes();
    var signedUp = new Date(rows[i][0]), email = String(rows[i][1]).trim();
    if (rows[i][COL_WELCOME - 1] === true || !isValidEmail(email) || /@example\.com$/i.test(email)) continue;
    // Fecha ilegible (escrita a mano, vacía…) → se trata como reciente: mejor esperar que enviar antes de tiempo.
    if (isNaN(signedUp.getTime()) || signedUp > cutoff) { pending++; continue; }
    if (MailApp.getRemainingDailyQuota() < 2) { pending++; continue; }
    sendToSubscriber(email, WELCOME.subject, welcomeHtml());
    markSent(i + 2, COL_WELCOME, COL_WELCOME_DATE);
    sent++;
  }
  if (sent) {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: '✦ Bienvenida enviada · Music Mind',
      htmlBody: notifyHtml('Email de Marta (infografía) enviado', [
        ['Enviados hoy', String(sent)], ['Pendientes para próximos días', String(pending)]
      ])
    });
  }
}

// Ejecutar UNA vez desde el editor: crea la tarea diaria de sendPendingWelcomes().
function setupWelcomeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendPendingWelcomes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendPendingWelcomes').timeBased().everyDays(1).atHour(WELCOME_HOUR).create();
  Logger.log('Tarea diaria creada (' + WELCOME_HOUR + ':00). Primer envío a partir de ' + WELCOME_START);
}

/* ---------- Invitación a contactos de la agenda ----------
   Ejecutar a mano desde el editor. Envía inviteHtml() a cada contacto de
   INVITES una sola vez y lo apunta en la pestaña INVITACIONES. Se salta a
   quien ya la recibió o ya está suscrito a la newsletter. Se puede volver a
   ejecutar sin riesgo: solo envía a los que falten. */
function sendContactInvites() {
  var log = getSheet(INVITES_SHEET_NAME, ['Fecha', 'Email', 'Nombre', 'Invitación enviada', '¿Se ha suscrito?']);
  var subs = getSheet(SHEET_NAME, NEWS_COLS);
  var sent = 0, skipped = [];
  INVITES.forEach(function (c) {
    var email = String(c[0]).trim().toLowerCase(), name = String(c[1] || '').trim();
    if (!isValidEmail(email)) { skipped.push(email + ' (email no válido)'); return; }
    if (emailExists(log, 2, email)) { skipped.push(email + ' (ya invitado)'); return; }
    if (emailExists(subs, 2, email)) { skipped.push(email + ' (ya suscrito)'); return; }
    if (MailApp.getRemainingDailyQuota() < 2) { skipped.push(email + ' (cuota diaria agotada: vuelve a ejecutar mañana)'); return; }
    sendToSubscriber(email, INVITE_SUBJECT, inviteHtml(name));
    log.appendRow([new Date(), email, name]);
    var cb = log.getRange(log.getLastRow(), 4, 1, 2);
    cb.insertCheckboxes();
    cb.setValues([[true, false]]);
    sent++;
  });
  Logger.log('Invitaciones enviadas: ' + sent + (skipped.length ? '\nSaltadas:\n' + skipped.join('\n') : ''));
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '✉ Invitaciones enviadas · Music Mind',
    htmlBody: notifyHtml('Invitación a contactos de la agenda', [
      ['Enviadas', String(sent)], ['Saltadas', skipped.length ? skipped.join('\n') : 'Ninguna']
    ])
  });
}

/* ---------- Previsualizar emails ----------
   Ejecuta esta función desde el editor (▶ Ejecutar) para recibir en
  PREVIEW_TO los tres emails: kit al suscribirse, email de Marta con la
  infografía y kit desde la landing. */
var PREVIEW_TO = 'maxim@hipeagency.es';
function previewEmails() {
  var opts = function (html) { return { htmlBody: html, name: SENDER_NAME, from: SENDER_EMAIL, replyTo: REPLY_TO }; };
  GmailApp.sendEmail(PREVIEW_TO, '[PRUEBA 1] Kit al suscribirse', 'HTML', opts(kitWelcomeHtml()));
  GmailApp.sendEmail(PREVIEW_TO, '[PRUEBA 2] ' + WELCOME.subject, 'HTML', opts(welcomeHtml()));
  GmailApp.sendEmail(PREVIEW_TO, '[PRUEBA 3] Kit desde la landing', 'HTML', opts(leadHtml(LEAD_MAGNETS['kit-emergencia'], false)));
}

// Solo la invitación a contactos, con un nombre de ejemplo.
function previewInvite() {
  GmailApp.sendEmail(PREVIEW_TO, '[PRUEBA] ' + INVITE_SUBJECT, 'HTML',
    { htmlBody: inviteHtml('Olga'), name: SENDER_NAME, from: SENDER_EMAIL, replyTo: REPLY_TO });
}
