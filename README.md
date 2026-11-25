# MedClick – Proyecto inicial

Plataforma web de gestión médica para consultorios pequeños. Incluye frontend HTML/CSS/JS, backend Node.js/Express y base de datos Microsoft SQL Server.

## 1. Requisitos
- Visual Studio Code
- Node.js LTS
- Microsoft SQL Server (Express o Developer)
- SQL Server Management Studio (SSMS)

## 2. Crear la base de datos
1. Abre SSMS y conéctate a tu instancia.
2. Abre `database/medclick.sql`.
3. Ejecuta el script completo.
4. Se crearán la base `MedClickDB`, tablas, relaciones y procedimientos básicos.

## 3. Configurar el servidor
Abre una terminal en esta carpeta y ejecuta:

```bash
npm install
```

Copia `.env.example` como `.env` y ajusta los datos de conexión de SQL Server. En Windows puedes usar autenticación integrada con `DB_WINDOWS_AUTH=true`; para ello instala y configura `msnodesqlv8` (ver nota en `.env.example`). La configuración más sencilla para principiantes es crear un usuario SQL dedicado y usar `DB_USER` y `DB_PASSWORD`.

Luego inicia:

```bash
npm run dev
```

Abre `http://localhost:3000`.

## 4. Primer administrador
Por seguridad no se crea un administrador con contraseña fija. Después de instalar dependencias, ejecuta:

```bash
npm run crear-admin
```

El asistente solicitará nombre, correo y contraseña. Guarda esa contraseña de forma segura.

## 5. Personalizar logo, fotos y QR
- Logo: reemplaza `public/assets/logo-medclick.svg` por tu logo (conserva el nombre) o cambia la ruta en `public/index.html`.
- Fotografías: coloca tus imágenes en `public/assets/` y cambia las rutas en `public/index.html`.
- QR bancario: coloca tu imagen como `public/assets/qr-banco.png`. La sección de administración muestra esa ruta como referencia. No subas un QR real a un repositorio público.

## 6. Flujo de uso
- El paciente puede crear su cuenta gratis.
- El médico puede solicitar una cuenta; queda `PENDIENTE` hasta que el administrador verifique el pago y active la suscripción.
- El administrador puede registrar pagos, activar/suspender suscripciones y consultar vencimientos.
- Un médico activo puede registrar consultas y emitir un PDF.
- El paciente solo puede consultar sus propios registros; no puede editarlos, borrarlos ni imprimirlos desde su cuenta.
- Un médico puede crear una ficha de paciente con registro asistido. El paciente podrá crear después su acceso con el mismo carnet y correo.

## 7. Importante antes de usar con pacientes reales
Este es un prototipo académico funcional para desarrollar y defender el proyecto, no un sistema clínico certificado. Antes de almacenar datos reales se requiere revisión profesional de seguridad, copias de respaldo, HTTPS, control de acceso, auditoría, política de privacidad, consentimiento informado y adecuación a la normativa boliviana aplicable. No uses datos reales durante las pruebas. El PDF es un documento generado por el sistema y no sustituye la firma o validación profesional que corresponda.

## 8. Estructura
- `public/`: HTML, CSS, JavaScript e imágenes.
- `server/`: API, autenticación, conexión SQL y generación PDF.
- `database/medclick.sql`: base de datos para SSMS.
