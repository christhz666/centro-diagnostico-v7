const Resultado = require('../models/Resultado');
const Cita = require('../models/Cita');
const Paciente = require('../models/Paciente');
const Factura = require('../models/Factura');

// Estados de pago constantes
const ESTADOS_PAGO_PENDIENTE = ['borrador', 'emitida'];

// @desc    Obtener resultados (con filtros)
// @route   GET /api/resultados
exports.getResultados = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        let filter = {};

        if (req.query.paciente || req.query.pacienteId) filter.paciente = req.query.paciente || req.query.pacienteId;
        if (req.query.cita) filter.cita = req.query.cita;
        if (req.query.estado) filter.estado = req.query.estado;
        if (req.query.estudio) filter.estudio = req.query.estudio;
        if (req.query.codigoMuestra) filter.codigoMuestra = req.query.codigoMuestra;

        const [resultados, total] = await Promise.all([
            Resultado.find(filter)
                .populate('paciente', 'nombre apellido cedula')
                .populate('estudio', 'nombre codigo categoria')
                .populate('medico', 'nombre apellido especialidad')
                .populate('realizadoPor', 'nombre apellido')
                .populate('validadoPor', 'nombre apellido')
                .sort('-createdAt')
                .skip(skip)
                .limit(limit),
            Resultado.countDocuments(filter)
        ]);

        res.json({
            success: true,
            count: resultados.length,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: resultados
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Obtener resultados por paciente
// @route   GET /api/resultados/paciente/:pacienteId
exports.getResultadosPorPaciente = async (req, res, next) => {
    try {
        const resultados = await Resultado.find({ 
            paciente: req.params.pacienteId,
            estado: { $ne: 'anulado' }
        })
            .populate('estudio', 'nombre codigo categoria')
            .populate('medico', 'nombre apellido especialidad')
            .populate('validadoPor', 'nombre apellido')
            .sort('-createdAt');

        res.json({
            success: true,
            count: resultados.length,
            data: resultados
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Obtener resultados por cédula (para QR)
// @route   GET /api/resultados/cedula/:cedula
exports.getResultadosPorCedula = async (req, res, next) => {
    try {
        const paciente = await Paciente.findOne({ cedula: req.params.cedula });
        
        if (!paciente) {
            return res.status(404).json({
                success: false,
                message: 'Paciente no encontrado'
            });
        }

        const resultados = await Resultado.find({ 
            paciente: paciente._id,
            estado: { $in: ['completado', 'entregado'] }
        })
            .populate('estudio', 'nombre codigo categoria')
            .populate('medico', 'nombre apellido especialidad')
            .populate('validadoPor', 'nombre apellido')
            .sort('-createdAt');

        res.json({
            success: true,
            paciente: {
                _id: paciente._id,
                nombre: paciente.nombre,
                apellido: paciente.apellido,
                cedula: paciente.cedula,
                fechaNacimiento: paciente.fechaNacimiento,
                sexo: paciente.sexo,
                nacionalidad: paciente.nacionalidad
            },
            count: resultados.length,
            data: resultados
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Obtener un resultado por código de muestra
// @route   GET /api/resultados/muestra/:codigoMuestra
exports.getResultadoPorCodigo = async (req, res, next) => {
    try {
        let codigoMuestra = req.params.codigoMuestra;
        
        // Si el código es solo números, intentar buscar con L primero (para laboratorio)
        if (/^\d+$/.test(codigoMuestra)) {
            const codigoConL = `L${codigoMuestra}`;
            const resultadoLab = await Resultado.findOne({ codigoMuestra: codigoConL })
                .populate('paciente')
                .populate('estudio')
                .populate('medico', 'nombre apellido especialidad licenciaMedica')
                .populate('realizadoPor', 'nombre apellido')
                .populate('validadoPor', 'nombre apellido');
            
            if (resultadoLab) {
                return res.json({ success: true, data: resultadoLab });
            }
        }
        
        // Buscar con el código tal cual
        const resultado = await Resultado.findOne({ codigoMuestra: codigoMuestra })
            .populate('paciente')
            .populate('estudio')
            .populate('medico', 'nombre apellido especialidad licenciaMedica')
            .populate('realizadoPor', 'nombre apellido')
            .populate('validadoPor', 'nombre apellido');

        if (!resultado) {
            return res.status(404).json({
                success: false,
                message: 'Resultado no encontrado con código: ' + req.params.codigoMuestra
            });
        }

        res.json({ success: true, data: resultado });
    } catch (error) {
        next(error);
    }
};

// @desc    Obtener un resultado
// @route   GET /api/resultados/:id
exports.getResultado = async (req, res, next) => {
    try {
        const resultado = await Resultado.findById(req.params.id)
            .populate('paciente')
            .populate('estudio')
            .populate('medico', 'nombre apellido especialidad licenciaMedica')
            .populate('realizadoPor', 'nombre apellido')
            .populate('validadoPor', 'nombre apellido');

        if (!resultado) {
            return res.status(404).json({
                success: false,
                message: 'Resultado no encontrado'
            });
        }

        res.json({ success: true, data: resultado });
    } catch (error) {
        next(error);
    }
};

// @desc    Crear resultado
// @route   POST /api/resultados
exports.createResultado = async (req, res, next) => {
    try {
        req.body.realizadoPor = req.user?._id;

        const resultado = await Resultado.create(req.body);

        await resultado.populate('paciente', 'nombre apellido');
        await resultado.populate('estudio', 'nombre codigo');

        res.status(201).json({
            success: true,
            message: 'Resultado creado exitosamente',
            data: resultado
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Actualizar resultado
// @route   PUT /api/resultados/:id
exports.updateResultado = async (req, res, next) => {
    try {
        const resultado = await Resultado.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        )
            .populate('paciente', 'nombre apellido')
            .populate('estudio', 'nombre codigo');

        if (!resultado) {
            return res.status(404).json({
                success: false,
                message: 'Resultado no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Resultado actualizado',
            data: resultado
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Validar resultado
// @route   PUT /api/resultados/:id/validar
exports.validarResultado = async (req, res, next) => {
    try {
        const resultado = await Resultado.findByIdAndUpdate(
            req.params.id,
            {
                estado: 'completado',
                validadoPor: req.user?._id,
                fechaValidacion: new Date(),
                interpretacion: req.body.interpretacion,
                conclusion: req.body.conclusion
            },
            { new: true }
        )
            .populate('paciente')
            .populate('estudio')
            .populate('validadoPor', 'nombre apellido');

        if (!resultado) {
            return res.status(404).json({
                success: false,
                message: 'Resultado no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Resultado validado exitosamente',
            data: resultado
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Eliminar resultado
// @route   DELETE /api/resultados/:id
exports.deleteResultado = async (req, res, next) => {
    try {
        const resultado = await Resultado.findByIdAndDelete(req.params.id);

        if (!resultado) {
            return res.status(404).json({
                success: false,
                message: 'Resultado no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Resultado eliminado'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Marcar como impreso
// @route   PUT /api/resultados/:id/imprimir
exports.marcarImpreso = async (req, res, next) => {
    try {
        const resultado = await Resultado.findByIdAndUpdate(
            req.params.id,
            {
                impreso: true,
                $inc: { vecesImpreso: 1 }
            },
            { new: true }
        );

        res.json({ success: true, data: resultado });
    } catch (error) {
        next(error);
    }
};

// @desc    Verificar estado de pago antes de imprimir
// @route   GET /api/resultados/:id/verificar-pago
exports.verificarPago = async (req, res, next) => {
    try {
        // Obtener el resultado con la cita y paciente poblados
        const resultado = await Resultado.findById(req.params.id)
            .populate('cita')
            .populate('paciente', 'nombre apellido');

        if (!resultado) {
            return res.status(404).json({
                success: false,
                message: 'Resultado no encontrado'
            });
        }

        // Buscar facturas asociadas al paciente que estén pendientes de pago
        const facturasPendientes = await Factura.find({
            paciente: resultado.paciente._id,
            $or: [
                { pagado: false },
                { estado: { $in: ESTADOS_PAGO_PENDIENTE } }
            ]
        }).select('numero total montoPagado estado');

        // Calcular el total pendiente
        let montoPendiente = 0;
        facturasPendientes.forEach(factura => {
            const pendiente = factura.total - (factura.montoPagado || 0);
            if (pendiente > 0) {
                montoPendiente += pendiente;
            }
        });

        const puedeImprimir = montoPendiente === 0;

        res.json({
            success: true,
            puede_imprimir: puedeImprimir,
            monto_pendiente: montoPendiente,
            facturas_pendientes: facturasPendientes.map(f => ({
                id: f._id,
                numero: f.numero,
                total: f.total,
                pagado: f.montoPagado || 0,
                pendiente: f.total - (f.montoPagado || 0),
                estado: f.estado
            })),
            paciente: {
                nombre: resultado.paciente.nombre,
                apellido: resultado.paciente.apellido
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Obtener resultados por código QR de factura (SOLO los de esa factura)
// @route   GET /api/resultados/qr/:codigoQR
exports.getResultadosPorQR = async (req, res, next) => {
    try {
        const factura = await Factura.findOne({ codigoQR: req.params.codigoQR })
            .populate('paciente', 'nombre apellido cedula fechaNacimiento sexo');

        if (!factura) {
            return res.status(404).json({
                success: false,
                message: 'Código QR inválido o factura no encontrada'
            });
        }

        // Obtener SOLO los resultados de la cita asociada a esta factura
        let filter = { paciente: factura.paciente._id };
        // Buscar por factura directa, o por cita si existe
        if (factura.cita) {
            filter = { $or: [
                { factura: factura._id },
                { cita: factura.cita, paciente: factura.paciente._id }
            ]};
        } else {
            filter.factura = factura._id;
        }

        const resultados = await Resultado.find(filter)
            .populate('estudio', 'nombre codigo categoria')
            .populate('medico', 'nombre apellido especialidad')
            .populate('validadoPor', 'nombre apellido')
            .sort('-createdAt');

        res.json({
            success: true,
            factura: {
                numero: factura.numero,
                fecha: factura.createdAt,
                total: factura.total,
                estado: factura.estado
            },
            paciente: factura.paciente,
            count: resultados.length,
            data: resultados
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Acceso del paciente con usuario y contraseña (desde factura)
// @route   POST /api/resultados/acceso-paciente
exports.accesoPaciente = async (req, res, next) => {
    try {
        const { username, password } = req.body;

        // Buscar factura que coincida con las credenciales
        const factura = await Factura.findOne({
            pacienteUsername: username,
            pacientePassword: password
        }).populate('paciente', 'nombre apellido cedula fechaNacimiento sexo').sort('-createdAt');

        if (!factura) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales incorrectas'
            });
        }

        // Obtener resultados de esa factura específica
        let filter = { paciente: factura.paciente._id };
        if (factura.cita) {
            filter.cita = factura.cita;
        }

        const resultados = await Resultado.find(filter)
            .populate('estudio', 'nombre codigo categoria')
            .populate('medico', 'nombre apellido especialidad')
            .populate('validadoPor', 'nombre apellido')
            .sort('-createdAt');

        res.json({
            success: true,
            factura: {
                numero: factura.numero,
                fecha: factura.createdAt,
                total: factura.total,
                estado: factura.estado
            },
            paciente: factura.paciente,
            count: resultados.length,
            data: resultados
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Obtener resultados por número de factura (para búsqueda interna)
// @route   GET /api/resultados/factura/:facturaNumero
exports.getResultadosPorFactura = async (req, res, next) => {
    try {
        const factura = await Factura.findOne({ 
            $or: [
                { numero: req.params.facturaNumero },
                { _id: req.params.facturaNumero.match(/^[0-9a-fA-F]{24}$/) ? req.params.facturaNumero : null }
            ]
        }).populate('paciente', 'nombre apellido cedula');

        if (!factura) {
            return res.status(404).json({
                success: false,
                message: 'Factura no encontrada'
            });
        }

        let filter = { paciente: factura.paciente._id };
        if (factura.cita) {
            filter.cita = factura.cita;
        }

        const resultados = await Resultado.find(filter)
            .populate('estudio', 'nombre codigo categoria')
            .populate('medico', 'nombre apellido especialidad')
            .populate('validadoPor', 'nombre apellido')
            .sort('-createdAt');

        res.json({
            success: true,
            factura: {
                _id: factura._id,
                numero: factura.numero,
                fecha: factura.createdAt,
                total: factura.total,
                codigoQR: factura.codigoQR,
                pacienteUsername: factura.pacienteUsername,
                pacientePassword: factura.pacientePassword
            },
            paciente: factura.paciente,
            count: resultados.length,
            data: resultados
        });
    } catch (error) {
        next(error);
    }
};
