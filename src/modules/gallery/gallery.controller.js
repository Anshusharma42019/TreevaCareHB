import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync.js';
import ApiResponse from '../../utils/ApiResponse.js';
import * as galleryService from './gallery.service.js';

export const createReport = catchAsync(async (req, res) => {
  const report = await galleryService.createReport(req.body, req.file, req.user._id);
  res.status(httpStatus.CREATED).send(
    new ApiResponse(httpStatus.CREATED, report, 'Report uploaded successfully')
  );
});

export const getReports = catchAsync(async (req, res) => {
  const result = await galleryService.queryReports(req.query, req.user);
  res.status(httpStatus.OK).send(
    new ApiResponse(httpStatus.OK, result, 'Reports retrieved successfully')
  );
});

export const getReportById = catchAsync(async (req, res) => {
  const report = await galleryService.getReportById(req.params.id);
  res.status(httpStatus.OK).send(
    new ApiResponse(httpStatus.OK, report, 'Report retrieved successfully')
  );
});

export const updateReport = catchAsync(async (req, res) => {
  const report = await galleryService.updateReport(req.params.id, req.body);
  res.status(httpStatus.OK).send(
    new ApiResponse(httpStatus.OK, report, 'Report updated successfully')
  );
});

export const deleteReport = catchAsync(async (req, res) => {
  await galleryService.deleteReport(req.params.id);
  res.status(httpStatus.OK).send(
    new ApiResponse(httpStatus.OK, null, 'Report deleted successfully')
  );
});

export const lookupCustomer = catchAsync(async (req, res) => {
  const query = req.query.query || req.query.term || '';
  const customers = await galleryService.lookupCustomer(query);
  res.status(httpStatus.OK).send(
    new ApiResponse(httpStatus.OK, customers, 'Matching customers retrieved')
  );
});

export const viewReportFile = catchAsync(async (req, res) => {
  const { buffer, mimeType, fileName } = await galleryService.getReportFileStream(req.params.id);
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

export const downloadReportFile = catchAsync(async (req, res) => {
  const { buffer, mimeType, fileName } = await galleryService.getReportFileStream(req.params.id);
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});
