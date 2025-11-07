// Core type definitions for the Transplant Platform API
import { Request } from 'express';

export interface User {
  id: string;
  cognitoSub: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  title?: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  emailVerifiedAt?: Date;
  deletedAt?: Date;
}

export interface Patient {
  id: string;
  userId: string;
  dialysisClinicId?: string;
  assignedSocialWorkerId?: string;
  dateOfBirth?: Date;
  address?: string;
  primaryCarePhysician?: string;
  insuranceProvider?: string;
  profileCompleted: boolean;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  user?: User;
  dialysisClinic?: DialysisClinic;
  assignedSocialWorker?: SocialWorker;
  referrals?: PatientReferral[];
  roiConsents?: ROIConsent[];
}

export interface SocialWorker {
  id: string;
  userId: string;
  dialysisClinicId?: string;
  licenseNumber?: string;
  department?: string;
  emailNotificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  user?: User;
  dialysisClinic?: DialysisClinic;
  patients?: Patient[];
}

export interface DialysisClinic {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  socialWorkers?: SocialWorker[];
  patients?: Patient[];
}

export interface TransplantCenter {
  id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  distanceMiles?: number;
  phone?: string;
  email?: string;
  website?: string;
  specialties: string[];
  averageWaitTimeMonths?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  referrals?: PatientReferral[];
}

export interface ROIConsent {
  id: string;
  patientId: string;
  consentText: string;
  digitalSignature: string;
  ipAddress?: string;
  userAgent?: string;
  status: ConsentStatus;
  signedAt: Date;
  revokedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  patient?: Patient;
}

export interface PatientReferral {
  id: string;
  patientId: string;
  transplantCenterId: string;
  status: ReferralStatus;
  selectionOrder: number;
  submittedAt: Date;
  acknowledgedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  patient?: Patient;
  transplantCenter?: TransplantCenter;
}

export interface Notification {
  id: string;
  recipientId: string;
  patientId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  status: NotificationStatus;
  sentAt: Date;
  readAt?: Date;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  recipient?: SocialWorker;
  patient?: Patient;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userRole?: UserRole;
  sessionId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  endpoint?: string;
  method?: string;
  ipAddress?: string;
  userAgent?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  phiAccessed: boolean;
  phiFields?: string[];
  description?: string;
  metadata?: Record<string, any>;
  occurredAt: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  sessionToken: string;
  refreshToken?: string;
  deviceInfo?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  
  // Relations
  user?: User;
}

// Enums
export enum UserRole {
  PATIENT = 'patient',
  SOCIAL_WORKER = 'social_worker',
  ADMIN = 'admin'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING_VERIFICATION = 'pending_verification'
}

export enum ConsentStatus {
  PENDING = 'pending',
  SIGNED = 'signed',
  REVOKED = 'revoked'
}

export enum ReferralStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  ACKNOWLEDGED = 'acknowledged',
  COMPLETED = 'completed'
}

export enum NotificationType {
  PATIENT_REGISTERED = 'patient_registered',
  REFERRAL_SUBMITTED = 'referral_submitted',
  ROI_SIGNED = 'roi_signed',
  SYSTEM_ALERT = 'system_alert'
}

export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
  ARCHIVED = 'archived'
}

export enum AuditAction {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  EXPORT = 'EXPORT'
}

// API Request/Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ValidationError[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  userId?: string;
  userRole?: UserRole;
  sessionId?: string;
  cognitoSub?: string;
}

// Patient Registration Types
export interface PatientRegistrationRequest {
  title?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  address?: string;
  primaryCarePhysician?: string;
  insuranceProvider?: string;
  dialysisClinic: string;
  socialWorkerName: string;
  password: string;
}

export interface SocialWorkerRegistrationRequest {
  title?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  dialysisClinic: string;
  licenseNumber?: string;
  department?: string;
  password: string;
}

// ROI Consent Types
export interface ROIConsentRequest {
  consentText: string;
  digitalSignature: string;
}

// Transplant Center Selection Types
export interface TransplantCenterSelection {
  transplantCenterIds: string[];
}

// Notification Types
export interface CreateNotificationRequest {
  recipientId: string;
  patientId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
}

// Dashboard Types
export interface SocialWorkerDashboard {
  totalPatients: number;
  pendingReferrals: number;
  newRegistrations: number;
  recentNotifications: Notification[];
  patientsList: Patient[];
}

export interface PatientDashboard {
  profileCompleted: boolean;
  onboardingCompleted: boolean;
  roiSigned: boolean;
  referralsSubmitted: number;
  selectedTransplantCenters: TransplantCenter[];
}

// System Configuration Types
export interface SystemConfiguration {
  key: string;
  value: string;
  description?: string;
}