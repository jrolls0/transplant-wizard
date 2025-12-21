//
//  DocumentSubmissionView.swift
//  Transplant Platform - Patient Mobile App
//
//  Document upload view for submitting required documents
//

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct DocumentSubmissionView: View {
    @EnvironmentObject private var authManager: AuthenticationManager
    @Environment(\.dismiss) private var dismiss
    
    @State private var selectedDocumentType: DocumentType = .insuranceCard
    @State private var frontImage: UIImage?
    @State private var backImage: UIImage?
    @State private var pdfData: Data?
    @State private var pdfFileName: String?
    @State private var isUploading = false
    @State private var uploadSuccess = false
    @State private var errorMessage: String?
    @State private var showImagePicker = false
    @State private var showCamera = false
    @State private var showFilePicker = false
    @State private var isSelectingFront = true
    @State private var showSourceActionSheet = false
    
    var preselectedType: DocumentType?
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 8) {
                        Image(systemName: "doc.badge.plus")
                            .font(.system(size: 50))
                            .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                        
                        Text("Upload Documents")
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        Text("Select document type and upload your files securely")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top)
                    
                    // Document Type Selector
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Document Type")
                            .font(.headline)
                        
                        Menu {
                            ForEach(DocumentType.allCases, id: \.self) { type in
                                Button(action: {
                                    selectedDocumentType = type
                                    clearSelections()
                                }) {
                                    HStack {
                                        Text(type.displayName)
                                        if selectedDocumentType == type {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        } label: {
                            HStack {
                                Image(systemName: selectedDocumentType.icon)
                                    .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                                Text(selectedDocumentType.displayName)
                                    .foregroundColor(.primary)
                                Spacer()
                                Image(systemName: "chevron.down")
                                    .foregroundColor(.secondary)
                            }
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                        }
                    }
                    .padding(.horizontal)
                    
                    // Upload Section
                    if selectedDocumentType.requiresFrontBack {
                        // Front and Back Upload for Insurance Card
                        VStack(spacing: 16) {
                            DocumentImageUploadCard(
                                title: "Front Side",
                                image: frontImage,
                                onTap: {
                                    isSelectingFront = true
                                    showSourceActionSheet = true
                                },
                                onRemove: { frontImage = nil }
                            )
                            
                            DocumentImageUploadCard(
                                title: "Back Side",
                                image: backImage,
                                onTap: {
                                    isSelectingFront = false
                                    showSourceActionSheet = true
                                },
                                onRemove: { backImage = nil }
                            )
                        }
                        .padding(.horizontal)
                    } else {
                        // Single document upload
                        VStack(spacing: 16) {
                            if pdfData != nil {
                                // PDF Selected
                                HStack {
                                    Image(systemName: "doc.fill")
                                        .font(.title)
                                        .foregroundColor(.red)
                                    
                                    VStack(alignment: .leading) {
                                        Text(pdfFileName ?? "Document.pdf")
                                            .font(.headline)
                                        Text("PDF Document")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                    
                                    Spacer()
                                    
                                    Button(action: {
                                        pdfData = nil
                                        pdfFileName = nil
                                    }) {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(.secondary)
                                    }
                                }
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(12)
                                .padding(.horizontal)
                            } else {
                                DocumentImageUploadCard(
                                    title: "Upload Document",
                                    image: frontImage,
                                    onTap: {
                                        isSelectingFront = true
                                        showSourceActionSheet = true
                                    },
                                    onRemove: { frontImage = nil }
                                )
                                .padding(.horizontal)
                            }
                        }
                    }
                    
                    // Upload Button
                    Button(action: uploadDocuments) {
                        HStack {
                            if isUploading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Image(systemName: "arrow.up.circle.fill")
                                Text("Upload Document")
                                    .fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(
                            canUpload ?
                            LinearGradient(
                                colors: [Color(red: 0.2, green: 0.6, blue: 0.9), Color(red: 0.1, green: 0.5, blue: 0.8)],
                                startPoint: .leading,
                                endPoint: .trailing
                            ) :
                            LinearGradient(colors: [Color.gray, Color.gray], startPoint: .leading, endPoint: .trailing)
                        )
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(!canUpload || isUploading)
                    .padding(.horizontal)
                    
                    // Error Message
                    if let error = errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(.horizontal)
                    }
                    
                    // Success Message
                    if uploadSuccess {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Document uploaded successfully!")
                                .foregroundColor(.green)
                        }
                        .padding()
                        .background(Color.green.opacity(0.1))
                        .cornerRadius(12)
                        .padding(.horizontal)
                    }
                    
                    Spacer(minLength: 40)
                }
            }
            .navigationTitle("Documents")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .confirmationDialog("Select Source", isPresented: $showSourceActionSheet) {
                Button("Take Photo") {
                    showCamera = true
                }
                Button("Choose from Library") {
                    showImagePicker = true
                }
                if !selectedDocumentType.requiresFrontBack {
                    Button("Select PDF") {
                        showFilePicker = true
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
            .sheet(isPresented: $showImagePicker) {
                ImagePicker(image: isSelectingFront ? $frontImage : $backImage, sourceType: .photoLibrary)
            }
            .sheet(isPresented: $showCamera) {
                ImagePicker(image: isSelectingFront ? $frontImage : $backImage, sourceType: .camera)
            }
            .sheet(isPresented: $showFilePicker) {
                DocumentPicker(pdfData: $pdfData, fileName: $pdfFileName)
            }
        }
        .onAppear {
            if let type = preselectedType {
                selectedDocumentType = type
            }
        }
    }
    
    private var canUpload: Bool {
        if selectedDocumentType.requiresFrontBack {
            return frontImage != nil && backImage != nil
        } else {
            return frontImage != nil || pdfData != nil
        }
    }
    
    private func clearSelections() {
        frontImage = nil
        backImage = nil
        pdfData = nil
        pdfFileName = nil
        uploadSuccess = false
        errorMessage = nil
    }
    
    private func uploadDocuments() {
        guard let accessToken = KeychainManager.shared.getAccessToken() else {
            errorMessage = "Authentication required"
            return
        }
        
        isUploading = true
        errorMessage = nil
        uploadSuccess = false
        
        Task {
            do {
                var files: [(Data, String, String)] = [] // (data, filename, mimeType)
                
                if let front = frontImage, let data = front.jpegData(compressionQuality: 0.8) {
                    files.append((data, "front.jpg", "image/jpeg"))
                }
                
                if let back = backImage, let data = back.jpegData(compressionQuality: 0.8) {
                    files.append((data, "back.jpg", "image/jpeg"))
                }
                
                if let pdf = pdfData {
                    files.append((pdf, pdfFileName ?? "document.pdf", "application/pdf"))
                }
                
                try await APIService.shared.uploadDocument(
                    documentType: selectedDocumentType.rawValue,
                    files: files,
                    accessToken: accessToken
                )
                
                await MainActor.run {
                    isUploading = false
                    uploadSuccess = true
                    clearSelections()
                }
                
            } catch {
                await MainActor.run {
                    isUploading = false
                    errorMessage = "Upload failed: \(error.localizedDescription)"
                }
            }
        }
    }
}

// MARK: - Document Type Enum

enum DocumentType: String, CaseIterable {
    case insuranceCard = "insurance_card"
    case medicationList = "medication_list"
    case governmentId = "government_id"
    case medicalRecords = "medical_records"
    case labResults = "lab_results"
    case referralLetter = "referral_letter"
    case other = "other"
    
    var displayName: String {
        switch self {
        case .insuranceCard: return "Insurance Card"
        case .medicationList: return "Medication Card/List"
        case .governmentId: return "Government-Issued ID"
        case .medicalRecords: return "Medical Records"
        case .labResults: return "Lab Results"
        case .referralLetter: return "Referral Letter"
        case .other: return "Other Document"
        }
    }
    
    var icon: String {
        switch self {
        case .insuranceCard: return "creditcard.fill"
        case .medicationList: return "pills.fill"
        case .governmentId: return "person.text.rectangle.fill"
        case .medicalRecords: return "doc.text.fill"
        case .labResults: return "chart.bar.doc.horizontal.fill"
        case .referralLetter: return "envelope.fill"
        case .other: return "doc.fill"
        }
    }
    
    var requiresFrontBack: Bool {
        self == .insuranceCard
    }
}

// MARK: - Document Image Upload Card

struct DocumentImageUploadCard: View {
    let title: String
    let image: UIImage?
    let onTap: () -> Void
    let onRemove: () -> Void
    
    var body: some View {
        VStack(spacing: 12) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.medium)
            
            if let image = image {
                ZStack(alignment: .topTrailing) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(height: 150)
                        .cornerRadius(12)
                    
                    Button(action: onRemove) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundColor(.white)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }
                    .padding(8)
                }
            } else {
                Button(action: onTap) {
                    VStack(spacing: 12) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 30))
                            .foregroundColor(Color(red: 0.2, green: 0.6, blue: 0.9))
                        
                        Text("Tap to add photo")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 150)
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(style: StrokeStyle(lineWidth: 2, dash: [8]))
                            .foregroundColor(Color(.systemGray4))
                    )
                }
            }
        }
    }
}

// MARK: - Image Picker

struct ImagePicker: UIViewControllerRepresentable {
    @Binding var image: UIImage?
    let sourceType: UIImagePickerController.SourceType
    @Environment(\.dismiss) private var dismiss
    
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = sourceType
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ImagePicker
        
        init(_ parent: ImagePicker) {
            self.parent = parent
        }
        
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.image = image
            }
            parent.dismiss()
        }
        
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

// MARK: - Document Picker for PDFs

struct DocumentPicker: UIViewControllerRepresentable {
    @Binding var pdfData: Data?
    @Binding var fileName: String?
    @Environment(\.dismiss) private var dismiss
    
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.pdf])
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let parent: DocumentPicker
        
        init(_ parent: DocumentPicker) {
            self.parent = parent
        }
        
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else { return }
            
            guard url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }
            
            do {
                parent.pdfData = try Data(contentsOf: url)
                parent.fileName = url.lastPathComponent
            } catch {
                print("Error reading PDF: \(error)")
            }
            
            parent.dismiss()
        }
    }
}

#Preview {
    DocumentSubmissionView()
        .environmentObject(AuthenticationManager())
}
