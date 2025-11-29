const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

/**
 * PromptX角色包上传Multer配置
 * 功能：10MB限制、ZIP MIME检查、临时文件存储
 *
 * 基于research.md的技术决策：
 * - 使用multer v1.4.5-lts.1（已有依赖）
 * - 文件大小限制10MB
 * - 仅接受ZIP文件
 */

// 角色上传临时存储配置
const roleUploadStorage = multer.diskStorage({
  destination: function (_, __, cb) {
    const uploadOutput =
      process.env.NODE_ENV === "development"
        ? path.resolve(__dirname, `../../storage/temp/role-uploads`)
        : path.resolve(process.env.STORAGE_DIR, "temp/role-uploads");

    // 确保目录存在
    fs.mkdirSync(uploadOutput, { recursive: true });
    cb(null, uploadOutput);
  },
  filename: function (_, file, cb) {
    // 生成唯一的临时文件名，保留.zip扩展名
    const timestamp = Date.now();
    const randomId = uuidv4().split('-')[0]; // 取UUID前8位
    const tempFilename = `role-upload-${timestamp}-${randomId}.zip`;
    cb(null, tempFilename);
  },
});

// 文件过滤器：仅接受ZIP文件
const roleFileFilter = function (req, file, cb) {
  // 检查MIME类型
  const allowedMimeTypes = [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'multipart/x-zip',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // 检查文件扩展名作为备选验证
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.zip') {
      cb(null, true);
    } else {
      cb(new Error('仅支持ZIP格式的角色包。请上传.zip文件。'), false);
    }
  }
};

// Multer配置对象
const roleUploadConfig = {
  storage: roleUploadStorage,
  fileFilter: roleFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB in bytes
    files: 1, // 一次只能上传一个文件
  },
};

/**
 * 处理角色包上传的中间件
 * @param {Request} request
 * @param {Response} response
 * @param {NextFunction} next
 */
function handleRoleUpload(request, response, next) {
  const upload = multer(roleUploadConfig).single('file');

  upload(request, response, function (err) {
    if (err instanceof multer.MulterError) {
      // Multer错误处理
      if (err.code === 'LIMIT_FILE_SIZE') {
        return response.status(400).json({
          success: false,
          error: '文件过大，角色包不应超过10MB',
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return response.status(400).json({
          success: false,
          error: '一次只能上传一个角色包',
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return response.status(400).json({
          success: false,
          error: '上传字段名称错误，请使用"file"字段',
        });
      }
      return response.status(400).json({
        success: false,
        error: `文件上传错误: ${err.message}`,
      });
    } else if (err) {
      // 自定义错误（如文件类型过滤错误）
      return response.status(400).json({
        success: false,
        error: err.message,
      });
    }

    // 验证文件是否存在
    if (!request.file) {
      return response.status(400).json({
        success: false,
        error: '未检测到上传文件，请选择一个ZIP格式的角色包',
      });
    }

    // 成功，继续到下一个中间件
    next();
  });
}

module.exports = {
  handleRoleUpload,
  roleUploadConfig,
  roleUploadStorage,
};
