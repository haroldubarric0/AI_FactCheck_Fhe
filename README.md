# AI FactCheck: A Privacy-Preserving Misinformation Detector

AI FactCheck is a pioneering AI agent designed to detect and flag misinformation in a decentralized social network, leveraging **Zama's Fully Homomorphic Encryption technology**. This innovative approach allows the platform to analyze posts and their propagation patterns while maintaining user privacy, ultimately creating a more trustworthy social environment.

## Understanding the Challenge: Misinformation in Social Networks

In today's digital age, the spread of misinformation poses a significant threat to the integrity of social discourse. Users often encounter false information that can lead to misguided beliefs and harmful consequences. Traditional methods of content moderation risk invading user privacy or failing to adequately address the sophistication of misinformation techniques, leaving many platforms grappling with a growing distrust among their user base.

## Zama's FHE Solution: A Confidential Approach

AI FactCheck addresses this critical issue through the implementation of **Fully Homomorphic Encryption (FHE)**, which allows sensitive data to be processed without needing to decrypt it. By utilizing Zama's open-source libraries such as **Concrete** and **TFHE-rs**, the platform can securely analyze post content and compare it against a "rumor" model, all while ensuring that user speech privacy is maintained. This capability enables the detection of potential misinformation in real-time, empowering decentralized autonomous organizations (DAOs) to make informed decisions on flagged content.

## Key Features

- **Encrypted Content Analysis:** Posts are analyzed using FHE, ensuring that user data remains confidential throughout the process.
- **Homomorphic Execution of Rumor Detection Models:** The platform executes deception detection algorithms homomorphically, providing robust results without compromising privacy.
- **Privacy-First Misinformation Combat:** By utilizing FHE, the project aims to combat false information without infringing on users' rights to free speech.
- **DAO Decision Making:** User-flagged content is ultimately reviewed and decided upon by a DAO, fostering community engagement and transparency.

## Technology Stack

The AI FactCheck platform is built on a solid foundation of technologies:

- **Zama SDK (Concrete, TFHE-rs):** Main component for executing homomorphic encryption.
- **Node.js:** Used for server-side programming.
- **Hardhat/Foundry:** Development frameworks for compiling and testing smart contracts.
- **Solidity:** Smart contract language for the Ethereum blockchain.

## Directory Structure

Here is the structure of the AI FactCheck project:

```
AI_FactCheck_Fhe/
├── contracts/
│   └── AI_FactCheck.sol
├── src/
│   ├── index.js
│   └── utils/
│       └── encryption.js
├── tests/
│   └── AI_FactCheck.test.js
├── package.json
└── README.md
```

## Installation Instructions

To set up the AI FactCheck project, follow these steps:

1. Ensure you have **Node.js** and **npm** installed on your machine.
2. Navigate to the root directory of the project.
3. Execute the following command to install the necessary packages:

   ```bash
   npm install
   ```

   This will fetch the required libraries, including Zama's FHE tools.

**Note:** Please refrain from using `git clone` or any repository URLs to obtain this project.

## Build & Run Guide

Once the installation is complete, you can compile, test, and run the AI FactCheck platform with the following commands:

1. **Compile the smart contract:**

   ```bash
   npx hardhat compile
   ```

2. **Run tests to ensure functionality:**

   ```bash
   npx hardhat test
   ```

3. **Start the server:**

   ```bash
   npx hardhat run src/index.js
   ```

## Example Code Snippet

Here’s a brief example of how you might analyze a post within the project. This code snippet showcases the use of the Zama SDK for encrypting the content before analysis:

```javascript
const { encryptPostContent } = require('./utils/encryption');

async function analyzePost(post) {
    // Encrypt the post content
    const encryptedContent = await encryptPostContent(post.content);
    
    // Simulate calling the FHE model for rumor detection
    const result = await runRumorDetectionModel(encryptedContent);
    
    if (result.isRumor) {
        console.log(`Warning: The post "${post.title}" may contain misinformation.`);
    } else {
        console.log(`The post "${post.title}" appears to be accurate.`);
    }
}
```

This snippet emphasizes the confidentiality of users' posts while enabling proactive monitoring against misinformation.

## Acknowledgements

### Powered by Zama

We extend our gratitude to the Zama team for their pioneering work in **Fully Homomorphic Encryption**. Their dedication to developing open-source tools has made it possible for us to create a confidential blockchain application capable of addressing one of today’s major challenges in social media: misinformation. Together, we can build a more trustworthy and healthy online community.

---
Feel free to contribute to the project by exploring our codebase, experimenting with new features, or reporting issues to help enhance AI FactCheck!
