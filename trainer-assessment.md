# ThopsTech Trainer Assessment - Internal Evaluation

## 📋 Assessment Overview
**Duration:** 2 hours  
**Total Marks:** 100  
**Passing Criteria:** 70% and above  

---

## 🧠 Section A: Logical Thinking (25 Marks)

### Question 1: Pattern Recognition (5 Marks)
```
Given the sequence:
2, 6, 12, 20, 30, 42, ?

a) What is the next number in the sequence?
b) What is the pattern/formula?
c) Write a function to generate the nth term of this sequence.
```

### Question 2: Logical Puzzle (8 Marks)
```
Five trainers - Alex, Ben, Clara, David, and Emma - specialize in different subjects:
Java, Python, React, Database, and DevOps.

Clues:
1. The Java trainer is not Alex or David
2. Ben teaches neither Python nor Database
3. Clara specializes in React
4. The Python trainer sits between Alex and Emma
5. David is not the DevOps trainer
6. The Database trainer is not the youngest

Determine who teaches which subject and explain your reasoning step-by-step.
```

### Question 3: Algorithm Design (12 Marks)
```
Design an algorithm to find the "missing number" problem:

Given an array of n-1 integers ranging from 1 to n (inclusive), 
exactly one number is missing. The array may contain duplicates.

Example:
Input: [3, 1, 3, 4, 2, 6, 6] (n = 7)
Missing: 5, 7 (Note: duplicates present)

Requirements:
a) Write the algorithm in pseudocode
b) Analyze time and space complexity
c) Handle edge cases (empty array, all duplicates, etc.)
d) Implement in your preferred programming language
```

---

## 💻 Section B: Coding Challenges (50 Marks)

### Question 4: Advanced Array Manipulation (10 Marks)
```javascript
// Problem: Flatten and Filter
// Write a function that:
// 1. Flattens nested arrays of any depth
// 2. Filters out all falsy values
// 3. Returns unique values only
// 4. Sorts the result in ascending order

function flattenFilterUnique(arr) {
    // Your implementation here
}

// Test cases:
console.log(flattenFilterUnique([1, [2, null, [3, false, [4, 5]]], 6, undefined, [7, [8, 9]]]));
// Expected: [1, 2, 3, 4, 5, 6, 7, 8, 9]

console.log(flattenFilterUnique([[[1, 2], 3], [4, [5, [6, null]]], false, 0]));
// Expected: [0, 1, 2, 3, 4, 5, 6]
```

### Question 5: Async JavaScript Mastery (12 Marks)
```javascript
// Problem: Concurrent API Calls with Rate Limiting
// Implement a function that makes multiple API calls concurrently
// but respects a maximum concurrency limit

class APICaller {
    constructor(maxConcurrent = 3) {
        this.maxConcurrent = maxConcurrent;
        this.running = 0;
        this.queue = [];
    }

    async call(url, options = {}) {
        // Simulate API call
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({ url, data: `Response from ${url}` });
            }, Math.random() * 1000 + 500);
        });
    }

    async makeCall(url, options = {}) {
        // Your implementation here
        // Should respect maxConcurrent limit
        // Return promise with API response
    }

    async makeMultipleCalls(urls) {
        // Your implementation here
        // Should call all URLs with concurrency control
        // Return array of responses in order of completion
    }
}

// Test:
const caller = new APICaller(2);
const urls = ['api1.com', 'api2.com', 'api3.com', 'api4.com', 'api5.com'];
const results = await caller.makeMultipleCalls(urls);
console.log(results);
```

### Question 6: Data Structure Implementation (15 Marks)
```javascript
// Problem: Implement a Least Recently Used (LRU) Cache
// Requirements:
// - O(1) time complexity for get and put operations
// - Fixed capacity
// - Evicts least recently used items when capacity is reached

class LRUCache {
    constructor(capacity) {
        // Your implementation here
    }

    get(key) {
        // Return value if key exists, otherwise -1
        // Update usage order
    }

    put(key, value) {
        // Insert or update key-value pair
        // Evict LRU if capacity exceeded
    }

    // Bonus: Implement delete(key) method for +5 marks
    delete(key) {
        // Remove key if exists
    }

    // Bonus: Implement getUsageOrder() for debugging
    getUsageOrder() {
        // Return array of keys in usage order (most recent first)
    }
}

// Test cases:
const cache = new LRUCache(3);
cache.put(1, 'A');
cache.put(2, 'B');
cache.put(3, 'C');
console.log(cache.get(1)); // Should return 'A'
cache.put(4, 'D'); // Should evict key 2 (least recently used)
console.log(cache.get(2)); // Should return -1
```

### Question 7: React Advanced Patterns (13 Marks)
```jsx
// Problem: Create a Custom Hook for Complex State Management
// Implement a useMultiStepForm hook that manages multi-step form state

import { useState, useCallback } from 'react';

// Your implementation here
function useMultiStepForm(steps, initialData = {}) {
    // Should return:
    // - currentStep index
    // - currentStepData
    // - formData (all steps data)
    // - next(), previous(), goTo(), reset() functions
    // - isLastStep, isFirstStep booleans
}

// Usage Example:
const steps = [
    { id: 'personal', fields: ['name', 'email', 'phone'] },
    { id: 'professional', fields: ['company', 'role', 'experience'] },
    { id: 'preferences', fields: ['notifications', 'theme', 'language'] }
];

function MultiStepForm() {
    const {
        currentStep,
        formData,
        next,
        previous,
        isLastStep,
        isFirstStep
    } = useMultiStepForm(steps);

    const handleSubmit = () => {
        console.log('Form submitted:', formData);
    };

    return (
        <div>
            <h2>Step {currentStep + 1}: {steps[currentStep].id}</h2>
            {/* Form fields implementation */}
            <div>
                {!isFirstStep && <button onClick={previous}>Previous</button>}
                {isLastStep ? (
                    <button onClick={handleSubmit}>Submit</button>
                ) : (
                    <button onClick={next}>Next</button>
                )}
            </div>
        </div>
    );
}
```

---

## 🎯 Section C: Problem Solving & System Design (25 Marks)

### Question 8: Real-world Problem Solving (12 Marks)
```
Scenario: You're building a real-time analytics dashboard for ThopsTech that needs to:
- Handle 10,000 concurrent users
- Process 1M+ data points per minute
- Provide sub-second response times
- Support real-time updates

Tasks:
a) Design the system architecture (components, data flow, technologies)
b) Identify potential bottlenecks and solutions
c) Design the data schema for student analytics
d) Explain how you'd implement real-time updates efficiently
e) Discuss caching strategies and their trade-offs
```

### Question 9: Code Review & Optimization (13 Marks)
```javascript
// Given this poorly performing code, identify issues and optimize:

function getStudentAnalytics(students, filters = {}) {
    let result = [];
    
    for (let i = 0; i < students.length; i++) {
        let student = students[i];
        let include = true;
        
        // Filter by course
        if (filters.course && student.course !== filters.course) {
            include = false;
        }
        
        // Filter by year
        if (filters.year && student.year !== filters.year) {
            include = false;
        }
        
        // Filter by status
        if (filters.status && student.status !== filters.status) {
            include = false;
        }
        
        // Calculate metrics
        if (include) {
            let metrics = {
                name: student.name,
                course: student.name, // Bug: should be student.course
                performance: 0
            };
            
            // Calculate performance score
            let total = 0;
            for (let j = 0; j < student.scores.length; j++) {
                total += student.scores[j];
            }
            metrics.performance = total / student.scores.length;
            
            result.push(metrics);
        }
    }
    
    // Sort by performance (inefficient for large datasets)
    for (let i = 0; i < result.length; i++) {
        for (let j = i + 1; j < result.length; j++) {
            if (result[i].performance < result[j].performance) {
                let temp = result[i];
                result[i] = result[j];
                result[j] = temp;
            }
        }
    }
    
    return result;
}

// Tasks:
// a) Identify all bugs and performance issues
// b) Rewrite the function with optimizations
// c) Add proper error handling and input validation
// d) Implement memoization for repeated calls
// e) Write unit tests for edge cases
```

---

## 📝 Evaluation Criteria

### Scoring Breakdown:
- **Section A (Logical Thinking):** 25 marks
  - Q1: 5 marks
  - Q2: 8 marks  
  - Q3: 12 marks

- **Section B (Coding):** 50 marks
  - Q4: 10 marks
  - Q5: 12 marks
  - Q6: 15 marks
  - Q7: 13 marks

- **Section C (Problem Solving):** 25 marks
  - Q8: 12 marks
  - Q9: 13 marks

### Grading Rubric:
- **Excellent (90-100%):** Demonstrates deep understanding, clean code, optimal solutions
- **Good (80-89%):** Solid grasp with minor improvements needed
- **Satisfactory (70-79%):** Meets requirements with some inefficiencies
- **Needs Improvement (Below 70%):** Significant gaps in understanding

### Key Evaluation Points:
1. **Code Quality:** Readability, maintainability, best practices
2. **Problem Analysis:** Understanding requirements, edge cases
3. **Algorithm Efficiency:** Time/space complexity considerations
4. **Logical Reasoning:** Step-by-step problem solving
5. **System Thinking:** Architecture and design decisions

---

## ⏰ Time Management Suggestions
- Section A: 30 minutes
- Section B: 75 minutes  
- Section C: 15 minutes

## 📚 Reference Materials Allowed
- Language documentation (MDN, official docs)
- Algorithm references
- No AI assistants or search engines

---

**Good luck! This assessment is designed to evaluate your readiness to train the next generation of developers at ThopsTech!** 🚀
