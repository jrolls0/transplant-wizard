import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Chose the aspect of your log customizing the log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// Define which transports the logger must use to print out messages
const transports = [
  // Allow console logging in development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
  
  // File logging for all environments
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
  new winston.transports.File({
    filename: 'logs/all.log',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
];

// Add CloudWatch logging in production
if (process.env.NODE_ENV === 'production' && process.env.CLOUDWATCH_LOG_GROUP) {
  transports.push(
    new WinstonCloudWatch({
      logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
      logStreamName: process.env.CLOUDWATCH_LOG_STREAM || 'api-logs',
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      messageFormatter: ({ level, message, timestamp, meta }) => 
        `[${timestamp}] ${level.toUpperCase()}: ${message} ${meta ? JSON.stringify(meta) : ''}`,
    })
  );
}

// Create the logger instance that has to be exported 
// and used to log messages.
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

// Create specialized loggers for different purposes
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/audit.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    // In production, send audit logs to CloudWatch
    ...(process.env.NODE_ENV === 'production' && process.env.CLOUDWATCH_LOG_GROUP ? [
      new WinstonCloudWatch({
        logGroupName: `${process.env.CLOUDWATCH_LOG_GROUP}-audit`,
        logStreamName: 'audit-logs',
        awsRegion: process.env.AWS_REGION || 'us-east-1',
      })
    ] : [])
  ]
});

export const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/security.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    // In production, send security logs to CloudWatch
    ...(process.env.NODE_ENV === 'production' && process.env.CLOUDWATCH_LOG_GROUP ? [
      new WinstonCloudWatch({
        logGroupName: `${process.env.CLOUDWATCH_LOG_GROUP}-security`,
        logStreamName: 'security-logs',
        awsRegion: process.env.AWS_REGION || 'us-east-1',
      })
    ] : [])
  ]
});

// Log the logger level and active transports
logger.info(`Logger initialized with level: ${logger.level}`);
logger.info(`Active transports: ${transports.map(t => t.constructor.name).join(', ')}`);

export default logger;