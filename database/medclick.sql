/* MEDCLICK - Base de datos para Microsoft SQL Server / SSMS
   Ejecutar con una cuenta que pueda crear bases de datos y usuarios. */
IF DB_ID(N'MedClickDB') IS NULL
    CREATE DATABASE MedClickDB;
GO
USE MedClickDB;
GO

CREATE TABLE dbo.Usuarios (
    UsuarioID INT IDENTITY(1,1) PRIMARY KEY,
    Rol VARCHAR(15) NOT NULL CHECK (Rol IN ('MEDICO','PACIENTE','ADMIN')),
    NombreCompleto NVARCHAR(150) NOT NULL,
    Correo NVARCHAR(180) NULL,
    Carnet NVARCHAR(30) NULL,
    MatriculaProfesional NVARCHAR(60) NULL,
    FechaNacimiento DATE NULL,
    Sexo NVARCHAR(20) NULL,
    PasswordHash NVARCHAR(255) NOT NULL,
    EstadoCuenta VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'
        CHECK (EstadoCuenta IN ('PENDIENTE','ACTIVO','SUSPENDIDO')),
    CreadoEn DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO
CREATE UNIQUE INDEX UX_Usuarios_Correo ON dbo.Usuarios(Correo) WHERE Correo IS NOT NULL;
CREATE UNIQUE INDEX UX_Usuarios_Carnet ON dbo.Usuarios(Carnet) WHERE Carnet IS NOT NULL;
CREATE UNIQUE INDEX UX_Usuarios_Matricula ON dbo.Usuarios(MatriculaProfesional) WHERE MatriculaProfesional IS NOT NULL;
GO

CREATE TABLE dbo.Suscripciones (
    SuscripcionID INT IDENTITY(1,1) PRIMARY KEY,
    MedicoID INT NOT NULL,
    Estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
       CHECK (Estado IN ('PENDIENTE','ACTIVA','VENCIDA','SUSPENDIDA')),
    FechaInicio DATE NULL,
    FechaVencimiento DATE NULL,
    Monto DECIMAL(10,2) NULL,
    ActualizadoEn DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Suscripciones_Medico FOREIGN KEY (MedicoID) REFERENCES dbo.Usuarios(UsuarioID)
);
GO

CREATE TABLE dbo.Pagos (
    PagoID INT IDENTITY(1,1) PRIMARY KEY,
    MedicoID INT NOT NULL,
    SuscripcionID INT NULL,
    Monto DECIMAL(10,2) NOT NULL CHECK (Monto >= 0),
    FechaPago DATE NOT NULL,
    PeriodoMeses INT NOT NULL DEFAULT 1 CHECK (PeriodoMeses > 0),
    Metodo NVARCHAR(50) NULL,
    Referencia NVARCHAR(100) NULL,
    Observacion NVARCHAR(500) NULL,
    RegistradoPor INT NOT NULL,
    CreadoEn DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Pagos_Medico FOREIGN KEY (MedicoID) REFERENCES dbo.Usuarios(UsuarioID),
    CONSTRAINT FK_Pagos_Suscripcion FOREIGN KEY (SuscripcionID) REFERENCES dbo.Suscripciones(SuscripcionID),
    CONSTRAINT FK_Pagos_Admin FOREIGN KEY (RegistradoPor) REFERENCES dbo.Usuarios(UsuarioID)
);
GO

CREATE TABLE dbo.Pacientes (
    PacienteID INT IDENTITY(1,1) PRIMARY KEY,
    UsuarioID INT NULL,
    NombreCompleto NVARCHAR(150) NOT NULL,
    Carnet NVARCHAR(30) NOT NULL UNIQUE,
    FechaNacimiento DATE NOT NULL,
    Sexo NVARCHAR(20) NULL,
    Correo NVARCHAR(180) NULL,
    CreadoPor INT NULL,
    CreadoEn DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Pacientes_Usuario FOREIGN KEY (UsuarioID) REFERENCES dbo.Usuarios(UsuarioID),
    CONSTRAINT FK_Pacientes_Creador FOREIGN KEY (CreadoPor) REFERENCES dbo.Usuarios(UsuarioID)
);
GO

CREATE TABLE dbo.Citas (
    CitaID INT IDENTITY(1,1) PRIMARY KEY,
    PacienteID INT NOT NULL,
    MedicoID INT NOT NULL,
    Especialidad NVARCHAR(100) NOT NULL,
    FechaHora DATETIME2 NOT NULL,
    Modalidad VARCHAR(15) NOT NULL DEFAULT 'VIRTUAL'
       CHECK (Modalidad IN ('VIRTUAL','PRESENCIAL')),
    Plataforma NVARCHAR(30) NULL,
    EnlaceTeleorientacion NVARCHAR(500) NULL,
    Motivo NVARCHAR(500) NULL,
    Estado VARCHAR(20) NOT NULL DEFAULT 'SOLICITADA'
       CHECK (Estado IN ('SOLICITADA','CONFIRMADA','ATENDIDA','CANCELADA')),
    CreadoEn DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Citas_Paciente FOREIGN KEY (PacienteID) REFERENCES dbo.Pacientes(PacienteID),
    CONSTRAINT FK_Citas_Medico FOREIGN KEY (MedicoID) REFERENCES dbo.Usuarios(UsuarioID)
);
GO

CREATE TABLE dbo.Consultas (
    ConsultaID INT IDENTITY(1,1) PRIMARY KEY,
    PacienteID INT NOT NULL,
    MedicoID INT NOT NULL,
    CitaID INT NULL,
    FechaConsulta DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    MotivoConsulta NVARCHAR(MAX) NULL,
    EnfermedadActual NVARCHAR(MAX) NULL,
    ExamenFisico NVARCHAR(MAX) NULL,
    Diagnostico NVARCHAR(MAX) NOT NULL,
    Tratamiento NVARCHAR(MAX) NULL,
    Observaciones NVARCHAR(MAX) NULL,
    CONSTRAINT FK_Consultas_Paciente FOREIGN KEY (PacienteID) REFERENCES dbo.Pacientes(PacienteID),
    CONSTRAINT FK_Consultas_Medico FOREIGN KEY (MedicoID) REFERENCES dbo.Usuarios(UsuarioID),
    CONSTRAINT FK_Consultas_Cita FOREIGN KEY (CitaID) REFERENCES dbo.Citas(CitaID)
);
GO

CREATE TABLE dbo.SignosVitales (
    SignosID INT IDENTITY(1,1) PRIMARY KEY,
    ConsultaID INT NOT NULL UNIQUE,
    PesoKg DECIMAL(6,2) NULL,
    TallaCm DECIMAL(6,2) NULL,
    PresionArterial NVARCHAR(20) NULL,
    FrecuenciaCardiaca INT NULL,
    FrecuenciaRespiratoria INT NULL,
    Temperatura DECIMAL(4,1) NULL,
    SaturacionOxigeno DECIMAL(5,2) NULL,
    Glicemia DECIMAL(7,2) NULL,
    IMC DECIMAL(5,2) NULL,
    CONSTRAINT FK_Signos_Consulta FOREIGN KEY (ConsultaID) REFERENCES dbo.Consultas(ConsultaID)
);
GO

CREATE TABLE dbo.Recetas (
    RecetaID INT IDENTITY(1,1) PRIMARY KEY,
    ConsultaID INT NOT NULL,
    Medicamento NVARCHAR(180) NOT NULL,
    Dosis NVARCHAR(120) NULL,
    Frecuencia NVARCHAR(120) NULL,
    Duracion NVARCHAR(120) NULL,
    Indicaciones NVARCHAR(500) NULL,
    CONSTRAINT FK_Recetas_Consulta FOREIGN KEY (ConsultaID) REFERENCES dbo.Consultas(ConsultaID)
);
GO

CREATE TABLE dbo.Auditoria (
    AuditoriaID BIGINT IDENTITY(1,1) PRIMARY KEY,
    UsuarioID INT NULL,
    Accion NVARCHAR(120) NOT NULL,
    Entidad NVARCHAR(80) NULL,
    RegistroID INT NULL,
    Fecha DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    Detalle NVARCHAR(1000) NULL,
    CONSTRAINT FK_Auditoria_Usuario FOREIGN KEY (UsuarioID) REFERENCES dbo.Usuarios(UsuarioID)
);
GO

CREATE INDEX IX_Consultas_Paciente_Fecha ON dbo.Consultas(PacienteID, FechaConsulta DESC);
CREATE INDEX IX_Citas_Medico_Fecha ON dbo.Citas(MedicoID, FechaHora);
CREATE INDEX IX_Pagos_Medico_Fecha ON dbo.Pagos(MedicoID, FechaPago DESC);
GO

/* La aplicación conserva consultas y pacientes aunque una suscripción venza.
   No existe borrado automático de datos clínicos por deuda. */
PRINT 'Base de datos MedClickDB creada correctamente.';
GO
