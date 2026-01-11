<script lang="ts">
	// @ts-nocheck
	import { Label, Input, Toast, Button, Select, Textarea, Card } from 'flowbite-svelte';
	import {
		CheckOutline,
		CloseOutline,
		ExclamationCircleOutline,
		InfoCircleOutline,
		UserAddOutline,
		EyeOutline,
		EyeSlashOutline
	} from 'flowbite-svelte-icons';
	import {
		getAuth,
		createUserWithEmailAndPassword,
		deleteUser
	} from 'firebase/auth';
	import { firebaseConfig } from '$lib/firebaseConfig';
	import { initializeApp, getApps, getApp } from 'firebase/app';
	import {
		getFirestore,
		doc,
		setDoc,
		collection,
		query,
		where,
		getDocs
	} from 'firebase/firestore';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
	const auth = getAuth(app);
	const db = getFirestore(app);

	// Create a secondary auth instance for patient registration without affecting admin session
	let secondaryApp;
	try {
		secondaryApp = getApp('Secondary');
	} catch (error) {
		secondaryApp = initializeApp(firebaseConfig, 'Secondary');
	}
	const secondaryAuth = getAuth(secondaryApp);

	// Patient Account Information
	let email: string = '';
	let password: string = '';
	let confirmPassword: string = '';
	let showPassword: boolean = false;
	let showConfirmPassword: boolean = false;

	// Personal Information
	let firstName: string = '';
	let middleName: string = '';
	let lastName: string = '';
	let suffix: string = '';
	let birthday: string = '';
	let age: number = 0;
	let gender: string = '';
	let phone: string = '';
	let address: string = '';

	// Medical Information
	let bloodType: string = '';
	let allergies: string = '';
	let currentMedications: string = '';
	let medicalConditions: string[] = [];
	let otherMedicalConditions: string = '';
	let familyHistory: string[] = [];
	let otherFamilyHistory: string = '';
	let surgicalHistory: string = '';
	let bloodTransfusionHistory: string = '';
	let bloodTransfusionDate: string = '';

	const genderOptions = [
		{ value: '', name: 'Select Gender' },
		{ value: 'Male', name: 'Male' },
		{ value: 'Female', name: 'Female' },
		{ value: 'Other', name: 'Other' }
	];

	const bloodTypeOptions = [
		{ value: '', name: 'Select Blood Type' },
		{ value: 'A+', name: 'A+' },
		{ value: 'A-', name: 'A-' },
		{ value: 'B+', name: 'B+' },
		{ value: 'B-', name: 'B-' },
		{ value: 'AB+', name: 'AB+' },
		{ value: 'AB-', name: 'AB-' },
		{ value: 'O+', name: 'O+' },
		{ value: 'O-', name: 'O-' }
	];

	const medicalConditionOptions = [
		'Diabetes',
		'Hypertension',
		'Heart Disease',
		'Asthma',
		'Allergies',
		'Cancer',
		'Kidney Disease',
		'Liver Disease'
	];

	const familyHistoryOptions = [
		'Diabetes',
		'Hypertension',
		'Heart Disease',
		'Cancer',
		'Stroke',
		'Alzheimer\'s',
		'Mental Health Disorders'
	];

	type ToastType = 'info' | 'success' | 'warning' | 'error';
	let toastVisible: boolean = false;
	let toastMessage: string = '';
	let toastType: ToastType = 'info';
	let toastDuration: number = 3000;
	let toastTimeoutId: number | null = null;
	let isSubmitting: boolean = false;
	
	// Success Modal
	let showSuccessModal: boolean = false;
	let registeredPatientName: string = '';
	let registeredPatientId: string = '';

	function showToast(message: string, type: ToastType = 'info', duration: number = 3000) {
		toastMessage = message;
		toastType = type;
		toastVisible = true;
		toastDuration = duration;
		if (toastTimeoutId !== null) clearTimeout(toastTimeoutId);
		if (duration > 0) {
			toastTimeoutId = window.setTimeout(() => {
				toastVisible = false;
				toastTimeoutId = null;
			}, duration);
		}
	}

	function generateFiveDigitId(): string {
		const min = 10000;
		const max = 99999;
		const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
		return randomNumber.toString();
	}

	async function isCustomIdTaken(customIdToCheck: string): Promise<boolean> {
		const usersRef = collection(db, 'users');
		const q = query(usersRef, where('customUserId', '==', customIdToCheck));
		const querySnapshot = await getDocs(q);
		return !querySnapshot.empty;
	}

	async function generateUniqueCustomId(maxRetries: number = 10): Promise<string | null> {
		for (let i = 0; i < maxRetries; i++) {
			const potentialId = generateFiveDigitId();
			if (!(await isCustomIdTaken(potentialId))) {
				return potentialId;
			}
			console.warn(
				`Custom Patient ID ${potentialId} is already taken. Retrying... (${i + 1}/${maxRetries})`
			);
		}
		console.error('Failed to generate a unique custom Patient ID after several retries.');
		return null;
	}

	function calculateAge() {
		if (birthday) {
			const today = new Date();
			const birthDate = new Date(birthday);
			let calculatedAge = today.getFullYear() - birthDate.getFullYear();
			const monthDiff = today.getMonth() - birthDate.getMonth();
			if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
				calculatedAge--;
			}
			age = calculatedAge;
		}
	}

	function toggleMedicalCondition(condition: string) {
		if (medicalConditions.includes(condition)) {
			medicalConditions = medicalConditions.filter((c) => c !== condition);
		} else {
			medicalConditions = [...medicalConditions, condition];
		}
	}

	function toggleFamilyHistory(condition: string) {
		if (familyHistory.includes(condition)) {
			familyHistory = familyHistory.filter((c) => c !== condition);
		} else {
			familyHistory = [...familyHistory, condition];
		}
	}

	function handlePhoneInput(event: Event) {
		const input = event.target as HTMLInputElement;
		// Remove any non-numeric characters and limit to 11 digits
		phone = input.value.replace(/[^0-9]/g, '').slice(0, 11);
	}

	async function handlePatientRegistration() {
		// Validation
		if (!password || !confirmPassword) {
			showToast('Please provide a password for the patient account.', 'warning');
			return;
		}

		if (password !== confirmPassword) {
			showToast('Passwords do not match.', 'warning');
			return;
		}

		if (password.length < 6) {
			showToast('Password must be at least 6 characters.', 'warning');
			return;
		}

		if (!firstName || !lastName || !birthday || !gender || !phone || !address) {
			showToast('Please fill in all required personal information fields.', 'warning');
			return;
		}

		isSubmitting = true;
		showToast('Creating patient account...', 'info', 0);
		let createdAuthUser = null;

		try {
			// Use email or generate a unique one if not provided
			const accountEmail = email || `patient${Date.now()}@phpdmadmin.local`;
			
			// Create Firebase Auth account using secondary auth instance (won't log out admin)
			const userCredential = await createUserWithEmailAndPassword(secondaryAuth, accountEmail, password);
			const user = userCredential.user;
			createdAuthUser = user;

			// Generate unique patient ID
			const customPatientId = await generateUniqueCustomId();

			if (!customPatientId) {
				showToast(
					'Failed to generate a unique Patient ID. Please try again later.',
					'error',
					6000
				);
				if (createdAuthUser) {
					await deleteUser(createdAuthUser).catch((delErr) => {
						console.error(
							'Failed to delete auth user after custom ID generation failure:',
							delErr
						);
						showToast(
							'Critical error: Patient account might be orphaned. Contact support.',
							'error',
							10000
						);
					});
				}
				isSubmitting = false;
				if (toastMessage === 'Creating patient account...') toastVisible = false;
				return;
			}

			const currentDate = new Date().toISOString();

			// Create user document in 'users' collection
			await setDoc(doc(db, 'users', user.uid), {
				firebaseUid: user.uid,
				customUserId: customPatientId,
				email: user.email,
				role: 'userPatient',
				displayName: `${firstName} ${lastName}`,
				photoURL: null,
				providerId: 'password',
				registeredAt: currentDate,
				registrationDate: currentDate,
				createdAt: currentDate,
				isArchived: false
			});

			// Create patient profile document
			const patientProfileData = {
				name: firstName,
				middleName: middleName || '',
				lastName: lastName,
				suffix: suffix || '',
				birthday: birthday,
				age: age,
				gender: gender,
				phone: phone,
				address: address,
				email: user.email,
				bloodType: bloodType || '',
				allergies: allergies || '',
				currentMedications: currentMedications || '',
				medicalConditions: medicalConditions,
				otherMedicalConditions: otherMedicalConditions || '',
				familyHistory: familyHistory,
				otherFamilyHistory: otherFamilyHistory || '',
				surgicalHistory: surgicalHistory || '',
				bloodTransfusionHistory: bloodTransfusionHistory || '',
				bloodTransfusionDate: bloodTransfusionDate || '',
				registeredDate: currentDate,
				registrationDate: currentDate
			};

			await setDoc(doc(db, 'patientProfiles', user.uid), patientProfileData);

			// Sign out the newly created patient from secondary auth to ensure clean state
			await secondaryAuth.signOut();

			// Show success modal with patient details
			registeredPatientName = `${firstName} ${lastName}`;
			registeredPatientId = customPatientId;
			showSuccessModal = true;
			
			// Reset form after modal is shown
			setTimeout(() => {
				resetForm();
			}, 1000);
		} catch (error) {
			console.error('Patient Registration Error:', error);
			let userFriendlyMessage =
				'An unexpected error occurred during patient registration. Please try again.';

			if (error instanceof Error) {
				const firebaseError = error as any;
				if (firebaseError.code) {
					switch (firebaseError.code) {
						case 'auth/email-already-in-use':
							userFriendlyMessage =
								'This email is already registered. Please use a different email.';
							break;
						case 'auth/invalid-email':
							userFriendlyMessage = 'The email address is not valid.';
							break;
						case 'auth/operation-not-allowed':
							userFriendlyMessage = 'Patient registration is currently not allowed.';
							break;
						case 'auth/weak-password':
							userFriendlyMessage = 'The password is too weak (minimum 6 characters).';
							break;
						default:
							userFriendlyMessage =
								'Patient registration failed. Please check your details and try again.';
							break;
					}
				}
			}

			if (createdAuthUser && !(error as any).code?.startsWith('auth/')) {
				// If user was created but Firestore failed, clean up
				try {
					await deleteUser(createdAuthUser);
					console.log('Cleaned up orphaned auth user');
				} catch (deleteError) {
					console.error('Failed to delete orphaned user:', deleteError);
				}
			}

			showToast(userFriendlyMessage, 'error', 6000);
		} finally {
			isSubmitting = false;
		}
	}

	function resetForm() {
		email = '';
		password = '';
		confirmPassword = '';
		firstName = '';
		middleName = '';
		lastName = '';
		suffix = '';
		birthday = '';
		age = 0;
		gender = '';
		phone = '';
		address = '';
		bloodType = '';
		allergies = '';
		currentMedications = '';
		medicalConditions = [];
		otherMedicalConditions = '';
		familyHistory = [];
		otherFamilyHistory = '';
		surgicalHistory = '';
		bloodTransfusionHistory = '';
		bloodTransfusionDate = '';
	}
	
	function closeSuccessModal() {
		showSuccessModal = false;
		registeredPatientName = '';
		registeredPatientId = '';
	}
</script>

<div class="page-container">
	<!-- Header Section -->
	<div class="page-header">
		<div class="header-icon">
			<UserAddOutline class="w-8 h-8 text-white" />
		</div>
		<div class="header-content">
			<h1 class="header-title">Register New Patient</h1>
			<p class="header-subtitle">
				Create a new patient account with personal and medical information
			</p>
		</div>
	</div>

	<form on:submit|preventDefault={handlePatientRegistration} class="form-content">
		<!-- Account Credentials Section -->
		<div class="form-section">
			<h2 class="section-title">Account Credentials</h2>
			<div class="form-grid">
				<div class="form-group">
					<Label for="email" class="form-label">Email Address</Label>
					<Input
						type="email"
						id="email"
						bind:value={email}
						placeholder="patient@example.com"
						class="form-input"
					/>
				</div>
				<div class="form-group">
					<Label for="phone" class="form-label">Phone Number *</Label>
					<Input
						type="tel"
						id="phone"
						bind:value={phone}
						on:input={handlePhoneInput}
						placeholder="09123456789"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength="11"
						required
						class="form-input"
					/>
				</div>
				<div class="form-group password-group">
					<Label for="password" class="form-label">Password *</Label>
					<div class="password-input-wrapper">
						<Input
							type={showPassword ? 'text' : 'password'}
							id="password"
							bind:value={password}
							placeholder="Min. 6 characters"
							required
							class="form-input"
						/>
						<button
							type="button"
							class="password-toggle"
							on:click={() => (showPassword = !showPassword)}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							{#if showPassword}
								<EyeSlashOutline class="w-5 h-5" />
							{:else}
								<EyeOutline class="w-5 h-5" />
							{/if}
						</button>
					</div>
				</div>
				<div class="form-group password-group">
					<Label for="confirmPassword" class="form-label">Confirm Password *</Label>
					<div class="password-input-wrapper">
						<Input
							type={showConfirmPassword ? 'text' : 'password'}
							id="confirmPassword"
							bind:value={confirmPassword}
							placeholder="Re-enter password"
							required
							class="form-input"
						/>
						<button
							type="button"
							class="password-toggle"
							on:click={() => (showConfirmPassword = !showConfirmPassword)}
							aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
						>
							{#if showConfirmPassword}
								<EyeSlashOutline class="w-5 h-5" />
							{:else}
								<EyeOutline class="w-5 h-5" />
							{/if}
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Personal Information Section -->
		<div class="form-section">
			<h2 class="section-title">Personal Information</h2>
			<div class="form-grid-4">
				<div class="form-group">
					<Label for="firstName" class="form-label">First Name *</Label>
					<Input type="text" id="firstName" bind:value={firstName} placeholder="Juan" required class="form-input" />
				</div>
				<div class="form-group">
					<Label for="middleName" class="form-label">Middle Name</Label>
					<Input type="text" id="middleName" bind:value={middleName} placeholder="Santos" class="form-input" />
				</div>
				<div class="form-group">
					<Label for="lastName" class="form-label">Last Name *</Label>
					<Input type="text" id="lastName" bind:value={lastName} placeholder="Dela Cruz" required class="form-input" />
				</div>
				<div class="form-group">
					<Label for="suffix" class="form-label">Suffix</Label>
					<Input type="text" id="suffix" bind:value={suffix} placeholder="Jr., Sr., III" class="form-input" />
				</div>
			</div>

			<div class="form-grid-3 mt-4">
				<div class="form-group">
					<Label for="birthday" class="form-label">Birthday *</Label>
					<Input
						type="date"
						id="birthday"
						bind:value={birthday}
						on:change={calculateAge}
						required
						class="form-input"
					/>
				</div>
				<div class="form-group">
					<Label for="age" class="form-label">Age</Label>
					<Input type="number" id="age" bind:value={age} readonly class="form-input bg-gray-50" />
				</div>
				<div class="form-group">
					<Label for="gender" class="form-label">Gender *</Label>
					<Select id="gender" bind:value={gender} items={genderOptions} required class="form-input" />
				</div>
			</div>

			<div class="form-group mt-4">
				<Label for="address" class="form-label">Address *</Label>
				<Textarea
					id="address"
					bind:value={address}
					placeholder="Complete address including street, barangay, city, province"
					rows="3"
					required
					class="form-input"
				/>
			</div>
		</div>

		<!-- Medical Information Section -->
		<div class="form-section">
			<h2 class="section-title">Medical Information</h2>

			<div class="form-grid">
				<div class="form-group">
					<Label for="bloodType" class="form-label">Blood Type</Label>
					<Select id="bloodType" bind:value={bloodType} items={bloodTypeOptions} class="form-input" />
				</div>
				<div class="form-group">
					<Label for="allergies" class="form-label">Allergies</Label>
					<Input
						type="text"
						id="allergies"
						bind:value={allergies}
						placeholder="e.g., Penicillin, Peanuts"
						class="form-input"
					/>
				</div>
			</div>

			<div class="form-group mt-4">
				<Label for="currentMedications" class="form-label">Current Medications</Label>
				<Textarea
					id="currentMedications"
					bind:value={currentMedications}
					placeholder="List current medications and dosages"
					rows="2"
					class="form-input"
				/>
			</div>

			<div class="form-group mt-4">
				<Label class="form-label">Medical Conditions</Label>
				<div class="checkbox-grid">
					{#each medicalConditionOptions as condition}
						<label class="checkbox-label">
							<input
								type="checkbox"
								checked={medicalConditions.includes(condition)}
								on:change={() => toggleMedicalCondition(condition)}
								class="checkbox-input"
							/>
							<span class="checkbox-text">{condition}</span>
						</label>
					{/each}
				</div>
				<div class="mt-3">
					<Input
						type="text"
						bind:value={otherMedicalConditions}
						placeholder="Other medical conditions (specify)"
						class="form-input"
					/>
				</div>
			</div>

			<div class="form-group mt-4">
				<Label class="form-label">Family Medical History</Label>
				<div class="checkbox-grid">
					{#each familyHistoryOptions as condition}
						<label class="checkbox-label">
							<input
								type="checkbox"
								checked={familyHistory.includes(condition)}
								on:change={() => toggleFamilyHistory(condition)}
								class="checkbox-input"
							/>
							<span class="checkbox-text">{condition}</span>
						</label>
					{/each}
				</div>
				<div class="mt-3">
					<Input
						type="text"
						bind:value={otherFamilyHistory}
						placeholder="Other family history (specify)"
						class="form-input"
					/>
				</div>
			</div>

			<div class="form-group mt-4">
				<Label for="surgicalHistory" class="form-label">Surgical History</Label>
				<Textarea
					id="surgicalHistory"
					bind:value={surgicalHistory}
					placeholder="Previous surgeries and dates"
					rows="2"
					class="form-input"
				/>
			</div>

			<div class="form-grid mt-4">
				<div class="form-group">
					<Label for="bloodTransfusionHistory" class="form-label">Blood Transfusion History</Label>
					<Input
						type="text"
						id="bloodTransfusionHistory"
						bind:value={bloodTransfusionHistory}
						placeholder="Yes/No"
						class="form-input"
					/>
				</div>
				<div class="form-group">
					<Label for="bloodTransfusionDate" class="form-label">Blood Transfusion Date</Label>
					<Input type="date" id="bloodTransfusionDate" bind:value={bloodTransfusionDate} class="form-input" />
				</div>
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="form-actions">
			<button type="submit" class="btn-submit" disabled={isSubmitting}>
				{isSubmitting ? 'Creating Account...' : 'Create Patient Account'}
			</button>
		</div>
	</form>
</div>

<!-- Toast Notification -->
{#if toastVisible}
	<div class="fixed top-4 right-4 z-50">
		<Toast
			color={toastType === 'success'
				? 'green'
				: toastType === 'error'
					? 'red'
					: toastType === 'warning'
						? 'orange'
						: 'blue'}
			dismissable
			bind:open={toastVisible}
		>
			<svelte:fragment slot="icon">
				{#if toastType === 'success'}
					<CheckOutline class="w-5 h-5" />
				{:else if toastType === 'error'}
					<CloseOutline class="w-5 h-5" />
				{:else if toastType === 'warning'}
					<ExclamationCircleOutline class="w-5 h-5" />
				{:else}
					<InfoCircleOutline class="w-5 h-5" />
				{/if}
			</svelte:fragment>
			{toastMessage}
		</Toast>
	</div>
{/if}

<!-- Success Modal -->
{#if showSuccessModal}
	<div class="modal-overlay" on:click={closeSuccessModal}>
		<div class="success-modal" on:click|stopPropagation>
			<div class="modal-header">
				<div class="success-icon-wrapper">
					<div class="success-icon-circle">
						<CheckOutline class="w-12 h-12 text-white" />
					</div>
				</div>
				<h2 class="modal-title">Patient Registration Successful!</h2>
				<p class="modal-subtitle">New patient account has been created</p>
			</div>

			<div class="modal-content">
				<div class="patient-info-card">
					<div class="info-row">
						<span class="info-label">Patient Name:</span>
						<span class="info-value">{registeredPatientName}</span>
					</div>
					<div class="divider"></div>
					<div class="info-row patient-id-row">
						<span class="info-label">Patient ID:</span>
						<div class="patient-id-badge">
							{registeredPatientId}
						</div>
					</div>
				</div>

				<div class="note-box">
					<InfoCircleOutline class="w-5 h-5 text-blue-600" />
					<p>Please note this Patient ID for future reference and patient records.</p>
				</div>
			</div>

			<div class="modal-actions">
				<button class="btn-modal-close" on:click={closeSuccessModal}>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.page-container {
		max-width: 1300px;
		margin: 0 auto;
		padding: 2rem 2.5rem;
		background-color: transparent;
		min-height: 100vh;
	}

	.page-header {
		background: transparent;
		padding: 0;
		margin-bottom: 2.5rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.header-icon {
		background-color: #1e3a66;
		border-radius: 8px;
		padding: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 52px;
		height: 52px;
		flex-shrink: 0;
	}

	.header-content {
		flex: 1;
	}

	.header-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: #1e3a66;
		margin: 0;
		margin-bottom: 0.25rem;
		letter-spacing: -0.01em;
	}

	.header-subtitle {
		font-size: 0.9375rem;
		color: #6b7280;
		margin: 0;
		line-height: 1.5;
		font-weight: 400;
	}

	.form-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-section {
		background: #ffffff;
		border-radius: 8px;
		padding: 2rem;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
		border: 1px solid #e5e7eb;
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: #1e3a66;
		margin: 0 0 1.5rem 0;
		padding-bottom: 0;
		border-bottom: none;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.25rem;
	}

	.form-grid-3 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.25rem;
	}

	.form-grid-4 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1.25rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
	}

	.form-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.5rem;
	}

	:global(.form-input) {
		border: 1px solid #d1d5db;
		border-radius: 6px;
		padding: 0.625rem 0.875rem;
		font-size: 0.9375rem;
		transition: all 0.2s;
	}

	:global(.form-input:focus) {
		outline: none;
		border-color: #1e3a66;
		box-shadow: 0 0 0 3px rgba(30, 58, 102, 0.1);
	}

	.checkbox-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 0.875rem;
		padding: 1rem;
		background-color: #f9fafb;
		border-radius: 8px;
		border: 1px solid #e5e7eb;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		padding: 0.25rem;
		transition: background-color 0.2s;
		border-radius: 4px;
	}

	.checkbox-label:hover {
		background-color: rgba(30, 58, 102, 0.05);
	}

	.checkbox-input {
		width: 1rem;
		height: 1rem;
		border-radius: 4px;
		border: 1.5px solid #d1d5db;
		cursor: pointer;
		transition: all 0.2s;
		accent-color: #1e3a66;
	}

	.checkbox-input:checked {
		background-color: #1e3a66;
		border-color: #1e3a66;
	}

	.checkbox-text {
		font-size: 0.875rem;
		color: #4b5563;
		user-select: none;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		padding-top: 1rem;
	}

	.password-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.password-toggle {
		position: absolute;
		right: 0.875rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #6b7280;
		transition: color 0.2s;
	}

	.password-toggle:hover {
		color: #1e3a66;
	}

	:global(.password-group .form-input) {
		padding-right: 2.5rem;
	}

	.btn-submit {
		padding: 0.75rem 2rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: white;
		background: linear-gradient(135deg, #1e3a66 0%, #2d5a8e 100%);
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 2px 8px rgba(30, 58, 102, 0.2);
	}

	.btn-submit:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(30, 58, 102, 0.3);
	}

	.btn-submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Success Modal Styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		animation: fadeIn 0.2s ease-out;
		backdrop-filter: blur(4px);
	}

	.success-modal {
		background: white;
		border-radius: 16px;
		max-width: 500px;
		width: 90%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		animation: slideUp 0.3s ease-out;
		overflow: hidden;
	}

	.modal-header {
		text-align: center;
		padding: 2.5rem 2rem 1.5rem;
		background: linear-gradient(135deg, #1e3a66 0%, #2d5a8e 100%);
		position: relative;
	}

	.success-icon-wrapper {
		display: flex;
		justify-content: center;
		margin-bottom: 1.25rem;
	}

	.success-icon-circle {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		border: 3px solid rgba(255, 255, 255, 0.3);
		animation: scaleIn 0.4s ease-out 0.1s both;
	}

	.modal-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: white;
		margin: 0 0 0.5rem 0;
		line-height: 1.2;
	}

	.modal-subtitle {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.9);
		margin: 0;
		font-weight: 400;
	}

	.modal-content {
		padding: 2rem;
	}

	.patient-info-card {
		background: #f9fafb;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.25rem;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.info-label {
		font-size: 0.9375rem;
		color: #6b7280;
		font-weight: 500;
	}

	.info-value {
		font-size: 1.125rem;
		color: #1f2937;
		font-weight: 600;
	}

	.divider {
		height: 1px;
		background: #e5e7eb;
		margin: 1rem 0;
	}

	.patient-id-row {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.patient-id-badge {
		font-size: 1.75rem;
		font-weight: 700;
		color: #1e3a66;
		background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
		padding: 0.75rem 1.5rem;
		border-radius: 10px;
		letter-spacing: 0.05em;
		border: 2px solid #93c5fd;
		box-shadow: 0 2px 8px rgba(30, 58, 102, 0.1);
		align-self: center;
		width: 100%;
		text-align: center;
	}

	.note-box {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 8px;
		padding: 1rem;
	}

	.note-box p {
		margin: 0;
		font-size: 0.875rem;
		color: #1e40af;
		line-height: 1.5;
	}

	.modal-actions {
		display: flex;
		justify-content: center;
		padding: 0 2rem 2rem;
	}

	.btn-modal-close {
		padding: 0.875rem 3rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: white;
		background: linear-gradient(135deg, #1e3a66 0%, #2d5a8e 100%);
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 2px 8px rgba(30, 58, 102, 0.2);
	}

	.btn-modal-close:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(30, 58, 102, 0.3);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			transform: translateY(30px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes scaleIn {
		from {
			transform: scale(0.8);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	@media (max-width: 768px) {
		.page-container {
			padding: 1rem;
		}

		.page-header {
			flex-direction: column;
			text-align: center;
			padding: 1.5rem;
		}

		.header-title {
			font-size: 1.5rem;
		}

		.form-section {
			padding: 1.25rem;
		}

		.form-grid,
		.form-grid-3,
		.form-grid-4 {
			grid-template-columns: 1fr;
		}

		.checkbox-grid {
			grid-template-columns: 1fr;
		}

		.btn-submit {
			width: 100%;
		}

		.success-modal {
			width: 95%;
			max-width: 95%;
		}

		.modal-header {
			padding: 2rem 1.5rem 1.25rem;
		}

		.modal-title {
			font-size: 1.5rem;
		}

		.modal-content {
			padding: 1.5rem;
		}

		.patient-id-badge {
			font-size: 1.5rem;
		}

		.modal-actions {
			padding: 0 1.5rem 1.5rem;
		}

		.btn-modal-close {
			padding: 0.875rem 2rem;
		}
	}
</style>
