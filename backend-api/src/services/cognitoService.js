// AWS Cognito authentication service for HIPAA-compliant patient management
const { 
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminSetUserPasswordCommand,
    AdminInitiateAuthCommand,
    AdminConfirmSignUpCommand,
    AdminGetUserCommand,
    GetUserCommand,
    ConfirmSignUpCommand,
    InitiateAuthCommand,
    SignUpCommand,
    ConfirmForgotPasswordCommand,
    ForgotPasswordCommand,
    ResendConfirmationCodeCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

class CognitoService {
    constructor() {
        // AWS Cognito configuration from environment
        this.cognitoClient = new CognitoIdentityProviderClient({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
        
        this.userPoolId = process.env.COGNITO_USER_POOL_ID;
        this.clientId = process.env.COGNITO_MOBILE_CLIENT_ID;
        this.clientSecret = process.env.COGNITO_CLIENT_SECRET;
        
        if (!this.userPoolId || !this.clientId) {
            console.warn('⚠️  AWS Cognito configuration missing. Using test mode.');
            this.isTestMode = true;
        } else {
            console.log('✅ AWS Cognito service initialized');
            this.isTestMode = false;
        }
    }
    
    // Generate HMAC for client secret
    generateSecretHash(username) {
        if (!this.clientSecret) return undefined;
        
        const message = username + this.clientId;
        return CryptoJS.HmacSHA256(message, this.clientSecret).toString(CryptoJS.enc.Base64);
    }
    
    // Register new patient with AWS Cognito
    async registerPatient(email, password, patientData) {
        try {
            console.log(`🔐 Starting Cognito registration for ${email}`);
            
            if (this.isTestMode) {
                return this.handleTestModeRegistration(email, password, patientData);
            }
            
            const secretHash = this.generateSecretHash(email);
            
            // Prepare user attributes with patient data (using only standard attributes)
            const userAttributes = [
                { Name: 'email', Value: email },
                { Name: 'given_name', Value: patientData.firstName },
                { Name: 'family_name', Value: patientData.lastName }
            ];
            
            // Add phone number if provided
            if (patientData.phoneNumber) {
                userAttributes.push({ Name: 'phone_number', Value: patientData.phoneNumber });
            }
            
            // Add optional attributes if provided
            if (patientData.dateOfBirth) {
                userAttributes.push({ 
                    Name: 'birthdate', 
                    Value: patientData.dateOfBirth.toISOString().split('T')[0] 
                });
            }
            
            if (patientData.address) {
                userAttributes.push({ Name: 'address', Value: patientData.address });
            }
            
            const signUpParams = {
                ClientId: this.clientId,
                Username: email,
                Password: password,
                UserAttributes: userAttributes,
                SecretHash: secretHash
            };
            
            const command = new SignUpCommand(signUpParams);
            const response = await this.cognitoClient.send(command);
            
            console.log(`✅ Cognito user created: ${response.UserSub}`);
            
            return {
                success: true,
                userSub: response.UserSub,
                needsVerification: !response.UserConfirmed,
                message: 'Registration successful. Please check your email for verification code.'
            };
            
        } catch (error) {
            console.error('❌ Cognito registration error:', error);
            throw this.handleCognitoError(error);
        }
    }
    
    // Verify email with confirmation code
    async verifyEmail(email, confirmationCode) {
        try {
            console.log(`📧 Verifying email for ${email}`);
            
            if (this.isTestMode) {
                return this.handleTestModeVerification(email, confirmationCode);
            }
            
            const secretHash = this.generateSecretHash(email);
            
            const confirmParams = {
                ClientId: this.clientId,
                Username: email,
                ConfirmationCode: confirmationCode,
                SecretHash: secretHash
            };
            
            const command = new ConfirmSignUpCommand(confirmParams);
            await this.cognitoClient.send(command);
            
            console.log(`✅ Email verified for ${email}`);
            
            return {
                success: true,
                message: 'Email verified successfully'
            };
            
        } catch (error) {
            console.error('❌ Email verification error:', error);
            throw this.handleCognitoError(error);
        }
    }
    
    // Authenticate patient login
    async authenticatePatient(email, password) {
        try {
            console.log(`🔐 Authenticating patient ${email}`);
            
            if (this.isTestMode) {
                return this.handleTestModeLogin(email, password);
            }
            
            const secretHash = this.generateSecretHash(email);
            
            const authParams = {
                ClientId: this.clientId,
                AuthFlow: 'USER_PASSWORD_AUTH',
                AuthParameters: {
                    USERNAME: email,
                    PASSWORD: password,
                    SECRET_HASH: secretHash
                }
            };
            
            const command = new InitiateAuthCommand(authParams);
            const response = await this.cognitoClient.send(command);
            
            if (response.ChallengeName) {
                throw new Error(`Authentication challenge required: ${response.ChallengeName}`);
            }
            
            const tokens = response.AuthenticationResult;
            console.log(`✅ Authentication successful for ${email}`);
            
            return {
                success: true,
                accessToken: tokens.AccessToken,
                refreshToken: tokens.RefreshToken,
                idToken: tokens.IdToken,
                expiresIn: tokens.ExpiresIn
            };
            
        } catch (error) {
            console.error('❌ Authentication error:', error);
            throw this.handleCognitoError(error);
        }
    }
    
    // Get user information from access token
    async getUserInfo(accessToken) {
        try {
            if (this.isTestMode) {
                return this.handleTestModeUserInfo(accessToken);
            }
            
            const getUserParams = {
                AccessToken: accessToken
            };
            
            const command = new GetUserCommand(getUserParams);
            const response = await this.cognitoClient.send(command);
            
            // Parse user attributes
            const attributes = {};
            response.UserAttributes.forEach(attr => {
                attributes[attr.Name] = attr.Value;
            });
            
            return {
                sub: attributes.sub || 'unknown',
                email: attributes.email || 'unknown@example.com',
                firstName: attributes.given_name || 'Unknown',
                lastName: attributes.family_name || 'User',
                phoneNumber: attributes.phone_number || null,
                userType: attributes['custom:user_role'] || 'patient',
                profileCompleted: attributes['custom:profile_completed'] === 'true',
                onboardingCompleted: attributes['custom:onboarding_completed'] === 'true',
                roiSigned: attributes['custom:roi_signed'] === 'true',
                emailVerified: attributes.email_verified === 'true',
                createdAt: new Date()
            };
            
        } catch (error) {
            console.error('❌ Get user info error:', error);
            throw this.handleCognitoError(error);
        }
    }
    
    // Resend confirmation code
    async resendConfirmationCode(email) {
        try {
            if (this.isTestMode) {
                const code = Math.floor(100000 + Math.random() * 900000);
                console.log(`📧 TEST MODE - Verification code for ${email}: ${code}`);
                return { success: true, message: 'Verification code sent' };
            }
            
            const secretHash = this.generateSecretHash(email);
            
            const params = {
                ClientId: this.clientId,
                Username: email,
                SecretHash: secretHash
            };
            
            const command = new ResendConfirmationCodeCommand(params);
            await this.cognitoClient.send(command);
            
            return {
                success: true,
                message: 'Verification code sent to your email'
            };
            
        } catch (error) {
            console.error('❌ Resend confirmation error:', error);
            throw this.handleCognitoError(error);
        }
    }
    
    // Initiate password reset
    async initiatePasswordReset(email) {
        try {
            if (this.isTestMode) {
                console.log(`📧 TEST MODE - Password reset code for ${email}: 123456`);
                return { success: true, message: 'Password reset code sent' };
            }
            
            const secretHash = this.generateSecretHash(email);
            
            const params = {
                ClientId: this.clientId,
                Username: email,
                SecretHash: secretHash
            };
            
            const command = new ForgotPasswordCommand(params);
            await this.cognitoClient.send(command);
            
            return {
                success: true,
                message: 'Password reset code sent to your email'
            };
            
        } catch (error) {
            console.error('❌ Password reset initiation error:', error);
            throw this.handleCognitoError(error);
        }
    }
    
    // Confirm password reset
    async confirmPasswordReset(email, confirmationCode, newPassword) {
        try {
            if (this.isTestMode) {
                console.log(`✅ TEST MODE - Password reset confirmed for ${email}`);
                return { success: true, message: 'Password reset successful' };
            }
            
            const secretHash = this.generateSecretHash(email);
            
            const params = {
                ClientId: this.clientId,
                Username: email,
                ConfirmationCode: confirmationCode,
                Password: newPassword,
                SecretHash: secretHash
            };
            
            const command = new ConfirmForgotPasswordCommand(params);
            await this.cognitoClient.send(command);
            
            return {
                success: true,
                message: 'Password reset successful'
            };
            
        } catch (error) {
            console.error('❌ Password reset confirmation error:', error);
            throw this.handleCognitoError(error);
        }
    }
    
    // Test mode handlers for when AWS credentials are not available
    handleTestModeRegistration(email, password, patientData) {
        const userSub = `test_user_${Date.now()}`;
        const code = Math.floor(100000 + Math.random() * 900000);
        
        console.log(`📧 TEST MODE - Verification code for ${email}: ${code}`);
        
        return {
            success: true,
            userSub: userSub,
            needsVerification: true,
            message: 'Registration successful. Please check your email for verification code.'
        };
    }
    
    handleTestModeVerification(email, confirmationCode) {
        // Accept any 6-digit code in test mode
        if (confirmationCode && confirmationCode.length === 6) {
            console.log(`✅ TEST MODE - Email verified for ${email}`);
            return {
                success: true,
                message: 'Email verified successfully'
            };
        }
        throw new Error('Invalid verification code');
    }
    
    handleTestModeLogin(email, password) {
        const mockTokens = {
            accessToken: `test_access_${Date.now()}`,
            refreshToken: `test_refresh_${Date.now()}`,
            idToken: `test_id_${Date.now()}`,
            expiresIn: 3600
        };
        
        console.log(`✅ TEST MODE - Login successful for ${email}`);
        
        return {
            success: true,
            ...mockTokens
        };
    }
    
    handleTestModeUserInfo(accessToken) {
        return {
            sub: `test_user_${Date.now()}`,
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            phoneNumber: '',
            userType: 'patient',
            profileCompleted: false,
            onboardingCompleted: false,
            roiSigned: false,
            emailVerified: true,
            createdAt: new Date()
        };
    }
    
    // Handle Cognito-specific errors
    handleCognitoError(error) {
        const errorCode = error.name || error.__type;
        
        switch (errorCode) {
            case 'UsernameExistsException':
                return new Error('An account with this email already exists');
            case 'InvalidPasswordException':
                return new Error('Password does not meet requirements');
            case 'CodeMismatchException':
                return new Error('Invalid verification code');
            case 'ExpiredCodeException':
                return new Error('Verification code has expired');
            case 'NotAuthorizedException':
                return new Error('Invalid email or password');
            case 'UserNotConfirmedException':
                return new Error('Email not verified. Please check your email for verification code.');
            case 'UserNotFoundException':
                return new Error('User not found');
            case 'TooManyRequestsException':
                return new Error('Too many requests. Please try again later.');
            case 'LimitExceededException':
                return new Error('Request limit exceeded. Please try again later.');
            default:
                console.error('Unhandled Cognito error:', error);
                return new Error('Authentication service error. Please try again.');
        }
    }
}

module.exports = CognitoService;