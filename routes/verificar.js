const express = require("express");
const router = express.Router();
const Factura = require("../models/Factura");

router.get("/:codigo", async (req, res) => {
  try {
    const factura = await Factura.findOne({
      codigoQR: req.params.codigo
    }).populate("paciente");

    if (!factura) {
      return res.status(404).json({
        valido: false,
        mensaje: "Código no encontrado"
      });
    }

    res.json({
      valido: true,
      codigo: factura.codigoQR,
      numeroFactura: factura.numero,
      paciente: factura.datosCliente?.nombre || factura.paciente?.nombre,
      total: factura.total,
      fecha: factura.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: "Error interno" });
  }
});

module.exports = router;
