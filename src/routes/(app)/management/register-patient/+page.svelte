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
	let surgicalHistoryItems: string[] = [];
	let otherSurgicalHistory: string = '';
	let familyHistoryTable: { [member: string]: string[] } = {};
	let otherRelativeSpecify: string = '';
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
		'Anemia',
		'Anxiety',
		'Arthritis',
		'Asthma',
		'Blood transfusion',
		'Cancer',
		'Clotting disorder',
		'Congestive Heart Failure',
		'Depression',
		'Diabetes Mellitus',
		'Emphysema/COPD',
		'Gastro esophageal reflux (GERD)',
		'Glaucoma',
		'Heart murmur',
		'HIV/AIDS',
		'High Cholesterol',
		'Hypertension/high blood pressure'
	];

	const surgicalHistoryOptions = [
		'Appendectomy',
		'Brain surgery',
		'Breast surgery',
		'CABG',
		'Cholecystectomy',
		'Colon surgery',
		'Tonsillectomy',
		'Thyroid surgery',
		'Lung surgery',
		'C-section',
		'Eye surgery',
		'Fracture surgery',
		'Hernia repair',
		'Hysterectomy',
		'Joint surgery',
		'Pancreatomy',
		'Varicose vein surgery',
		'Prostate surgery',
		'Weight reduction surgery'
	];

	const familyHistoryConditions = [
		'Alcohol abuse',
		'Breast cancer',
		'Ovarian cancer',
		'Prostate cancer',
		'Other cancer',
		'Diabetes',
		'Heart Disease',
		'High cholesterol',
		'Hypertension',
		'Mental illness'
	];

	const familyMembers = [
		'Mother',
		'Father',
		'Sister',
		'Brother',
		'Daughter',
		'Son',
		'Other relative (specify)'
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
				`Custom Member ID ${potentialId} is already taken. Retrying... (${i + 1}/${maxRetries})`
			);
		}
		console.error('Failed to generate a unique custom Member ID after several retries.');
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

	function toggleSurgicalHistory(surgery: string) {
		if (surgicalHistoryItems.includes(surgery)) {
			surgicalHistoryItems = surgicalHistoryItems.filter((s) => s !== surgery);
		} else {
			surgicalHistoryItems = [...surgicalHistoryItems, surgery];
		}
	}

	function toggleFamilyHistoryCondition(member: string, condition: string) {
		if (!familyHistoryTable[member]) {
			familyHistoryTable[member] = [];
		}
		if (familyHistoryTable[member].includes(condition)) {
			familyHistoryTable[member] = familyHistoryTable[member].filter((c) => c !== condition);
		} else {
			familyHistoryTable[member] = [...familyHistoryTable[member], condition];
		}
		familyHistoryTable = { ...familyHistoryTable };
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
			const displayEmail = email || 'n/a';
			
			// Create Firebase Auth account using secondary auth instance (won't log out admin)
			const userCredential = await createUserWithEmailAndPassword(secondaryAuth, accountEmail, password);
			const user = userCredential.user;
			createdAuthUser = user;

			// Generate unique patient ID
			const customPatientId = await generateUniqueCustomId();

			if (!customPatientId) {
				showToast(
					'Failed to generate a unique Member ID. Please try again later.',
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
				email: displayEmail,
				bloodType: bloodType || '',
				allergies: allergies || '',
				currentMedications: currentMedications || '',
				medicalConditions: medicalConditions,
				otherMedicalConditions: otherMedicalConditions || '',
				surgicalHistoryItems: surgicalHistoryItems,
				otherSurgicalHistory: otherSurgicalHistory || '',
				familyHistoryTable: familyHistoryTable,
				otherRelativeSpecify: otherRelativeSpecify || '',
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
		surgicalHistoryItems = [];
		otherSurgicalHistory = '';
		familyHistoryTable = {};
		otherRelativeSpecify = '';
		bloodTransfusionHistory = '';
		bloodTransfusionDate = '';
	}
	
	function closeSuccessModal() {
		showSuccessModal = false;
		registeredPatientName = '';
		registeredPatientId = '';
	}
</script>

<div class="min-h-screen" style="background-color: #eef3ff;">
	<div class="min-h-screen" style="background-color: #eef3ff;">
		<div class="max-w-6xl mx-auto px-3 sm:p-4 md:p-8 py-6 sm:py-8 md:py-10">
			<div class="mb-6 sm:mb-8 md:mb-10">
				<div class="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
					<div class="p-2.5 sm:p-3 rounded-xl" style="background: linear-gradient(135deg, #0b2d56 0%, #1a4d7a 100%);">
						<UserAddOutline class="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 flex-shrink-0 text-white" />
					</div>
					<div>
						<h1 class="text-3xl sm:text-4xl md:text-4xl font-bold" style="color: #0b2d56;">Register New Member</h1>
						<p class="text-gray-600 text-sm sm:text-base md:text-base pl-0 font-medium">Create a new member account with personal and medical information</p>
					</div>
				</div>
			</div>

			<div class="page-container">

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
				<Label class="form-label">Your Medical Conditions (check all that apply)</Label>
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
				<Label class="form-label">Surgical History (check all that apply)</Label>
				<div class="checkbox-grid">
					{#each surgicalHistoryOptions as surgery}
						<label class="checkbox-label">
							<input
								type="checkbox"
								checked={surgicalHistoryItems.includes(surgery)}
								on:change={() => toggleSurgicalHistory(surgery)}
								class="checkbox-input"
							/>
							<span class="checkbox-text">{surgery}</span>
						</label>
					{/each}
				</div>
				<div class="mt-3">
					<Textarea
						bind:value={otherSurgicalHistory}
						placeholder="Other surgeries (specify with dates)"
						rows="2"
						class="form-input"
					/>
				</div>
			</div>

			<div class="form-group mt-4">
				<Label class="form-label">Family History (check all that apply)</Label>
				<div class="overflow-x-auto">
					<table class="w-full border-collapse border border-gray-300">
						<thead>
							<tr class="bg-gray-100">
								<th class="border border-gray-300 px-3 py-2 text-left font-semibold text-sm"></th>
								{#each familyHistoryConditions as condition}
									<th class="border border-gray-300 px-3 py-2 text-center font-medium text-xs">{condition}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each familyMembers as member}
								<tr>
									<td class="border border-gray-300 px-3 py-2 font-semibold text-sm">{member}</td>
									{#each familyHistoryConditions as condition}
										<td class="border border-gray-300 px-3 py-2 text-center">
											<input
												type="checkbox"
												checked={familyHistoryTable[member]?.includes(condition) || false}
												on:change={() => toggleFamilyHistoryCondition(member, condition)}
												class="checkbox-input"
											/>
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="mt-3">
					<Input
						type="text"
						bind:value={otherRelativeSpecify}
						placeholder="Specify other relative and conditions"
						class="form-input"
					/>
				</div>
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
				{isSubmitting ? 'Creating Account...' : 'Create Member Account'}
			</button>
		</div>
			</form>
		</div>
	</div>
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
				<h2 class="modal-title">Member Registration Successful!</h2>
				<p class="modal-subtitle">New Member account has been created</p>
			</div>

			<div class="modal-content">
				<div class="patient-info-card">
					<div class="info-row">
						<span class="info-label">Member Name:</span>
						<span class="info-value">{registeredPatientName}</span>
					</div>
					<div class="divider"></div>
					<div class="info-row patient-id-row">
						<span class="info-label">Member ID:</span>
						<div class="patient-id-badge">
							{registeredPatientId}
						</div>
					</div>
				</div>

				<div class="note-box">
					<InfoCircleOutline class="w-5 h-5 text-blue-600" />
					<p>Please note this Member ID is used for future reference and patient records.</p>
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
</div>

<style>
	.page-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
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
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem 1rem;
		padding: 1.25rem 1rem;
		background-color: #ffffff;
		border-radius: 6px;
		border: 1px solid #d1d5db;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		cursor: pointer;
		padding: 0.5rem 0.375rem;
		transition: background-color 0.15s;
		border-radius: 4px;
		min-height: 2.5rem;
	}

	.checkbox-label:hover {
		background-color: rgba(30, 58, 102, 0.04);
	}

	.checkbox-input {
		width: 1.125rem;
		height: 1.125rem;
		border-radius: 3px;
		border: 2px solid #6b7280;
		cursor: pointer;
		transition: all 0.15s ease;
		accent-color: #1e3a66;
		flex-shrink: 0;
		margin: 0;
	}

	.checkbox-input:hover {
		border-color: #1e3a66;
	}

	.checkbox-input:checked {
		background-color: #1e3a66;
		border-color: #1e3a66;
	}

	.checkbox-input:focus {
		outline: 2px solid #93c5fd;
		outline-offset: 2px;
	}

	.checkbox-text {
		font-size: 0.9375rem;
		color: #374151;
		user-select: none;
		line-height: 1.4;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		padding-top: 1rem;
		margin-top: 1rem;
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
			padding-bottom: 6rem;
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
			grid-template-columns: repeat(2, 1fr);
		}

		.form-actions {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			background: white;
			border-top: 1px solid #e5e7eb;
			padding: 1rem;
			box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
			z-index: 40;
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
